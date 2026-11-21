import { ORPCError } from "@orpc/server"
import { orders } from "@workspace/db"
import {
  addressCheckSchema,
  aramexConfigSchema,
  citiesRefreshSchema,
  connectionResultSchema,
  SHIPPING_COUNTRIES,
  saveShippingInputSchema,
  shippingSettingsViewSchema,
  testShippingInputSchema,
} from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { assertVaultReadable, describeIntegration, getIntegration, saveIntegration } from "../../lib/integrations"
import { enforceLimit } from "../../lib/rate-limit"
import { checkAddress, getCities } from "../../lib/shipping/locations"
import {
  ARAMEX_MISSING,
  aramexComplete,
  assertLiveAllowed,
  LIVE_ONLY_PRODUCTION,
  resolveShipping,
  runConnectionTest,
} from "../../lib/shipping/resolve"
import { getShippingSettings, saveShippingSettings } from "../../lib/shipping/settings"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

async function view(context: Parameters<typeof describeIntegration>[0]) {
  return {
    mode: await getShippingSettings(context.db),
    aramex: await describeIntegration(context, "aramex"),
    appEnv: context.config.appEnv,
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
    .input(z.object({ orderId: z.string() }))
    .output(addressCheckSchema)
    .handler(async ({ context, input }) => {
      const [order] = await context.db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1)
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Commande introuvable." })
      const result = await checkAddress(context, {
        name: order.customerName,
        phone: order.phone,
        line1: order.address,
        city: order.city,
        country: order.country,
        ...(order.postalCode ? { postalCode: order.postalCode } : {}),
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
}
