import { ORPCError } from "@orpc/server"
import { orders, shipments } from "@workspace/db"
import {
  addressCheckSchema,
  adminShipmentSchema,
  aramexConfigSchema,
  citiesRefreshSchema,
  connectionResultSchema,
  openShipmentSchema,
  pickupInputSchema,
  SHIPPING_COUNTRIES,
  saveShippingInputSchema,
  shipmentDraftInputSchema,
  shipmentDraftSchema,
  shippingSettingsViewSchema,
  testShippingInputSchema,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { assertVaultReadable, describeIntegration, getIntegration, saveIntegration } from "../../lib/integrations"
import { enforceLimit } from "../../lib/rate-limit"
import { checkAddress, getCities } from "../../lib/shipping/locations"
import { cancelPickup, cancelShipment, createPickup, listOpenShipments } from "../../lib/shipping/pickups"
import {
  ARAMEX_MISSING,
  aramexComplete,
  assertLiveAllowed,
  LIVE_ONLY_PRODUCTION,
  resolveShipping,
  runConnectionTest,
} from "../../lib/shipping/resolve"
import { getShippingSettings, saveShippingSettings } from "../../lib/shipping/settings"
import {
  commercialInvoiceDownloadUrl,
  createShipment,
  getOrderShipment,
  labelDownloadUrl,
  prepareShipment,
  retryCommercialInvoice,
  retryLabel,
} from "../../lib/shipping/shipments"
import { trackShipments } from "../../lib/shipping/tracking"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

async function view(context: Parameters<typeof describeIntegration>[0]) {
  return {
    mode: await getShippingSettings(context.db),
    aramex: await describeIntegration(context, "aramex"),
    appEnv: context.config.appEnv,
    simulated: context.config.aramexFake === true,
    degraded: (await resolveShipping(context).catch(() => null))?.degraded ?? null,
  }
}

export const shippingRouter = {
  getSettings: adminProcedure
    .route({ method: "GET", path: "/admin/shipping/settings", summary: "Shipping mode and Aramex, masked", tags: TAG })
    .input(z.object({}))
    .output(shippingSettingsViewSchema)
    .handler(({ context }) => view(context)),

  saveSettings: adminProcedure
    .route({ method: "PUT", path: "/admin/shipping/settings", summary: "Save shipping mode and Aramex", tags: TAG })
    .input(saveShippingInputSchema)
    .output(shippingSettingsViewSchema)
    .handler(async ({ context, input }) => {
      const config = input.aramex?.config
      if (config?.mode === "live") {
        if (context.config.appEnv !== "production")
          throw new ORPCError("BAD_REQUEST", { message: LIVE_ONLY_PRODUCTION })
        assertLiveAllowed(config)
      }
      if (input.mode.provider === "aramex") {
        // Checked on what would be stored, before anything is saved: a refusal leaves the credentials untouched.
        await assertVaultReadable(context)
        const saved = await getIntegration(context, "aramex")
        const secrets: Record<string, string> = { ...saved?.secrets }
        for (const [k, v] of Object.entries(input.aramex?.secrets ?? {})) {
          if (v === null) delete secrets[k]
          else if (v) secrets[k] = v
        }
        const merged = { config: (config ?? saved?.config ?? {}) as Record<string, unknown>, secrets }
        if (!aramexComplete(merged)) throw new ORPCError("PRECONDITION_FAILED", { message: ARAMEX_MISSING })
      }
      if (input.aramex) {
        await saveIntegration(context, context.admin.id, "aramex", {
          config: aramexConfigSchema.parse(input.aramex.config),
          secrets: input.aramex.secrets,
        })
      }
      await saveShippingSettings(context.db, input.mode)
      return view(context)
    }),

  checkAddress: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipping/check-address",
      summary: "Ask Aramex whether an order's address is recognised",
      tags: TAG,
    })
    .input(
      z.object({
        orderId: z.string(),
        /** The address as edited in the shipment dialog, when it differs from the order's. */
        address: z
          .object({
            line1: z.string().trim().min(3).max(100),
            city: z.string().trim().min(2).max(60),
            postalCode: z.string().trim().max(10).optional(),
          })
          .optional(),
      }),
    )
    .output(addressCheckSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "addressCheck",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      const [order] = await context.db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1)
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Commande introuvable." })
      const result = await checkAddress(context, {
        name: order.customerName,
        phone: order.phone,
        line1: input.address?.line1 ?? order.address,
        city: input.address?.city ?? order.city,
        country: order.country,
        ...((input.address ? input.address.postalCode : order.postalCode)
          ? { postalCode: (input.address ? input.address.postalCode : order.postalCode) as string }
          : {}),
      })
      return {
        ok: result.ok,
        message: result.message,
        suggestions: result.suggestions.slice(0, 5).map((s) => ({
          line1: s.line1,
          city: s.city,
          postalCode: s.postalCode ?? "",
        })),
      }
    }),

  refreshCities: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipping/cities/refresh",
      summary: "Fetch the Aramex city list again",
      tags: TAG,
    })
    .input(z.object({ country: z.enum(SHIPPING_COUNTRIES) }))
    .output(citiesRefreshSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shippingTest",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      const { cities, fetchedAt } = await getCities(context, input.country, { force: true })
      return { count: cities.length, fetchedAt }
    }),

  testConnection: adminProcedure
    .route({ method: "POST", path: "/admin/shipping/test", summary: "Try the Aramex credentials", tags: TAG })
    .input(testShippingInputSchema)
    .output(connectionResultSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shippingTest",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      await assertVaultReadable(context)
      const saved = await getIntegration(context, "aramex")
      const secrets: Record<string, string> = { ...saved?.secrets }
      for (const [k, v] of Object.entries(input.secrets ?? {})) if (v) secrets[k] = v
      const config = (input.config ?? saved?.config ?? {}) as Record<string, unknown>
      return runConnectionTest(context, { config, secrets })
    }),
  draft: adminProcedure
    .route({
      method: "GET",
      path: "/admin/orders/{orderId}/shipment/draft",
      summary: "The prefilled Aramex shipment of an order",
      tags: TAG,
    })
    .input(z.object({ orderId: z.string() }))
    .output(shipmentDraftSchema)
    .handler(({ context, input }) => prepareShipment(context, input.orderId)),

  createShipment: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{orderId}/shipment",
      summary: "Create the Aramex shipment and its label",
      tags: TAG,
    })
    .input(shipmentDraftInputSchema)
    .output(z.object({ shipmentId: z.string(), waybill: z.string() }))
    .handler(({ context, input }) => createShipment(context, context.admin.id, input)),

  shipmentOf: adminProcedure
    .route({
      method: "GET",
      path: "/admin/orders/{orderId}/shipment",
      summary: "The shipment of an order, without any bucket key",
      tags: TAG,
    })
    .input(z.object({ orderId: z.string() }))
    .output(adminShipmentSchema.nullable())
    .handler(({ context, input }) => getOrderShipment(context.db, input.orderId)),

  labelUrl: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/label-url",
      summary: "A 5 minute signed link to the label PDF",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), inline: z.boolean().optional() }))
    .output(z.object({ url: z.string() }))
    .handler(async ({ context, input }) => ({ url: await labelDownloadUrl(context, input.id, input.inline) })),

  refresh: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/refresh",
      summary: "Ask Aramex for the latest tracking of one shipment now",
      tags: TAG,
    })
    .input(z.object({ id: z.string() }))
    .output(adminShipmentSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shipmentRefresh",
        "too_many_requests",
        "Trop d'actualisations, réessayez dans quelques minutes.",
      )
      const [row] = await context.db
        .select({ orderId: shipments.orderId })
        .from(shipments)
        .where(eq(shipments.id, input.id))
        .limit(1)
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Expédition introuvable." })
      try {
        const report = await trackShipments(context, undefined, { shipmentId: input.id })
        if ("skipped" in report) throw new ORPCError("PRECONDITION_FAILED", { message: ARAMEX_MISSING })
      } catch (error) {
        if (error instanceof ORPCError) throw error
        throw new ORPCError("BAD_GATEWAY", { message: "Aramex ne répond pas, réessayez dans un instant." })
      }
      const shipment = await getOrderShipment(context.db, row.orderId)
      if (!shipment) throw new ORPCError("NOT_FOUND", { message: "Expédition introuvable." })
      return shipment
    }),

  openShipments: adminProcedure
    .route({
      method: "GET",
      path: "/admin/shipments/open",
      summary: "Aramex shipments that can be booked in a pickup",
      tags: TAG,
    })
    .input(z.object({}))
    .output(z.array(openShipmentSchema))
    .handler(({ context }) => listOpenShipments(context)),

  createPickup: adminProcedure
    .route({ method: "POST", path: "/admin/pickups", summary: "Book an Aramex pickup at the studio", tags: TAG })
    .input(pickupInputSchema)
    .output(z.object({ pickupId: z.string() }))
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shipmentAction",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      return createPickup(context, input)
    }),

  cancelPickup: adminProcedure
    .route({
      method: "POST",
      path: "/admin/pickups/{pickupId}/cancel",
      summary: "Cancel an Aramex pickup",
      tags: TAG,
    })
    .input(z.object({ pickupId: z.string(), reason: z.string().trim().min(3).max(200) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shipmentAction",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      await cancelPickup(context, input.pickupId, input.reason)
      return { ok: true as const }
    }),

  cancelShipment: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/cancel",
      summary: "Cancel a shipment whose label was just created (Aramex hold)",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), reason: z.string().trim().min(3).max(200) }))
    .output(z.object({ held: z.boolean(), message: z.string() }))
    .handler(async ({ context, input }) => {
      await enforceLimit(
        context,
        "shipmentAction",
        "too_many_requests",
        "Trop d'essais, réessayez dans quelques minutes.",
      )
      return cancelShipment(context, context.admin.id, input.id, input.reason)
    }),

  retryLabel: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/label",
      summary: "Fetch and store the label again",
      tags: TAG,
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await retryLabel(context, input.id)
      return { ok: true as const }
    }),

  commercialInvoiceUrl: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/commercial-invoice-url",
      summary: "A 5 minute signed link to the commercial invoice PDF",
      tags: TAG,
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ url: z.string() }))
    .handler(async ({ context, input }) => ({ url: await commercialInvoiceDownloadUrl(context, input.id) })),

  retryCommercialInvoice: adminProcedure
    .route({
      method: "POST",
      path: "/admin/shipments/{id}/commercial-invoice",
      summary: "Fetch and store the commercial invoice again",
      tags: TAG,
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await retryCommercialInvoice(context, input.id)
      return { ok: true as const }
    }),
}
