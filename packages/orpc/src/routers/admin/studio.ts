import { ORPCError } from "@orpc/server"
import { locations, orders } from "@workspace/db"
import {
  holdSettingsSchema,
  locationInputSchema,
  locationSchema,
  paymentSettingsSchema,
  type ShopProfileInput,
  storageUsageSchema,
  studioSettingsSchema,
  uploadSignSchema,
  uploadTargetSchema,
  validatePaymentSettings,
} from "@workspace/sdk"
import { and, asc, count, desc, eq } from "drizzle-orm"
import { z } from "zod"
import {
  assertVaultReadable,
  clearIntegration,
  describeIntegration,
  getIntegration,
  saveIntegration,
} from "../../lib/integrations"
import { assertKonnectUnlocked } from "../../lib/orders"
import { assertKonnectMode, gatewayReady, resolvePayments, testKonnectKey } from "../../lib/payments"
import { enforceLimit } from "../../lib/rate-limit"
import { getPaymentSettings, getSettings, savePaymentSettings, saveSettings } from "../../lib/settings"
import { getShopProfile, updateShopProfile } from "../../lib/shop-profile"
import { reserveUpload, storageUsage } from "../../lib/uploads"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as const

export const locationsRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/locations", summary: "All locations, hidden included", tags: TAG })
    .output(z.array(locationSchema))
    .handler(({ context }) => context.db.select().from(locations).orderBy(asc(locations.position))),

  create: adminProcedure
    .route({ method: "POST", path: "/admin/locations", summary: "Add a location", tags: TAG })
    .input(locationInputSchema)
    .output(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const [last] = await context.db
        .select({ p: locations.position })
        .from(locations)
        .orderBy(desc(locations.position))
        .limit(1)
      const [row] = await context.db
        .insert(locations)
        .values({ ...input, position: (last?.p ?? -1) + 1 })
        .returning({ id: locations.id })
      return { id: row!.id }
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/locations/{id}", summary: "Edit a location", tags: TAG })
    .input(locationInputSchema.extend({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const { id, ...values } = input
      const updated = await context.db
        .update(locations)
        .set(values)
        .where(eq(locations.id, id))
        .returning({ id: locations.id })
      if (!updated.length) throw new ORPCError("NOT_FOUND", { message: "Location not found." })
      return { ok: true as const }
    }),

  remove: adminProcedure
    .route({ method: "DELETE", path: "/admin/locations/{id}", summary: "Delete a location", tags: TAG })
    .input(z.object({ id: z.string() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await context.db.delete(locations).where(eq(locations.id, input.id))
      return { ok: true as const }
    }),
}

const konnectViewSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["vault", "env", "none"]),
  mode: z.enum(["test", "live"]).nullable(),
  walletIdMasked: z.string().nullable(),
  keyLast4: z.string().nullable(),
  pendingOnlineOrders: z.number().int(),
})
const konnectInputSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
  walletId: z.string().trim().min(6).max(100),
  mode: z.enum(["test", "live"]),
})

async function konnectView(context: Parameters<typeof describeIntegration>[0]) {
  const masked = await describeIntegration(context, "konnect")
  const walletId = typeof masked.config.walletId === "string" ? masked.config.walletId : ""
  const configured = !!masked.secrets.apiKey?.configured && walletId !== ""
  const [pending] = await context.db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.status, "pending_payment"), eq(orders.paymentMethod, "online")))
  return {
    pendingOnlineOrders: pending?.n ?? 0,
    configured,
    source: !configured ? ("none" as const) : masked.source === "db" ? ("vault" as const) : masked.source,
    mode: configured ? (masked.config.mode === "live" ? ("live" as const) : ("test" as const)) : null,
    walletIdMasked: walletId ? `••••${walletId.slice(-4)}` : null,
    keyLast4: masked.secrets.apiKey?.hint?.slice(-4) ?? null,
  }
}

const konnectRouter = {
  get: adminProcedure
    .route({ method: "GET", path: "/admin/settings/konnect", summary: "Konnect keys, masked", tags: TAG })
    .output(konnectViewSchema)
    .handler(({ context }) => konnectView(context)),

  save: adminProcedure
    .route({ method: "PUT", path: "/admin/settings/konnect", summary: "Save the Konnect keys", tags: TAG })
    .input(konnectInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      assertKonnectMode(context.config.appEnv, input.mode)
      await assertKonnectUnlocked(context, input)
      await saveIntegration(context, context.admin.id, "konnect", {
        config: { walletId: input.walletId, mode: input.mode },
        secrets: { apiKey: input.apiKey },
      })
      return { ok: true as const }
    }),

  test: adminProcedure
    .route({ method: "POST", path: "/admin/settings/konnect/test", summary: "Try the Konnect key", tags: TAG })
    .input(konnectInputSchema.partial())
    .output(z.object({ ok: z.boolean(), message: z.string() }))
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "konnectTest", "too_many_requests", "Trop d'essais, réessayez dans quelques minutes.")
      await assertVaultReadable(context)
      const saved = await getIntegration(context, "konnect")
      const apiKey = input.apiKey ?? saved?.secrets.apiKey
      if (!apiKey)
        throw new ORPCError("PRECONDITION_FAILED", { message: "Saisissez la clé API Konnect avant de tester." })
      const mode = input.mode ?? (saved?.config.mode === "live" ? "live" : "test")
      assertKonnectMode(context.config.appEnv, mode)
      return testKonnectKey(apiKey, mode, context.http)
    }),

  clear: adminProcedure
    .route({ method: "DELETE", path: "/admin/settings/konnect", summary: "Remove the saved Konnect keys", tags: TAG })
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context }) => {
      await assertKonnectUnlocked(context, "clear")
      await clearIntegration(context.db, "konnect", context.admin.id, context.now())
      return { ok: true as const }
    }),
}

export const settingsRouter = {
  konnect: konnectRouter,
  get: adminProcedure
    .route({ method: "GET", path: "/admin/settings", summary: "Contact details and delivery fees", tags: TAG })
    .output(studioSettingsSchema)
    .handler(async ({ context }) => {
      const [settings, profile] = await Promise.all([getSettings(context.db), getShopProfile(context.db)])
      return { ...settings, contactEmail: profile.email ?? "", phones: profile.phones }
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/settings", summary: "Save settings", tags: TAG })
    .input(studioSettingsSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const profile = await getShopProfile(context.db)
      const patch: ShopProfileInput = {}
      if (input.contactEmail !== undefined) {
        patch.email = input.contactEmail.trim() || null
        if (!profile.notifyEmail || profile.notifyEmail === profile.email) patch.notifyEmail = patch.email
      }
      if (input.phones !== undefined) patch.phones = input.phones
      if (Object.keys(patch).length > 0) await updateShopProfile(context.db, patch)
      await saveSettings(context.db, input)
      return { ok: true as const }
    }),

  getPayments: adminProcedure
    .route({
      method: "GET",
      path: "/admin/settings/payments",
      summary: "Payment methods offered at checkout",
      tags: TAG,
    })
    .output(
      z.object({
        settings: paymentSettingsSchema,
        gatewayReady: z.boolean(),
        gateway: z.object({ name: z.enum(["konnect", "demo"]), mode: z.enum(["test", "live"]) }),
        appEnv: z.enum(["local", "preview", "production"]),
      }),
    )
    .handler(async ({ context }) => ({
      settings: await getPaymentSettings(context.db, context.config),
      gatewayReady: await gatewayReady(context),
      gateway: await resolvePayments(context).then((p) => ({ name: p.name, mode: p.mode })),
      appEnv: context.config.appEnv,
    })),

  savePayments: adminProcedure
    .route({ method: "PUT", path: "/admin/settings/payments", summary: "Switch payment methods on or off", tags: TAG })
    .input(paymentSettingsSchema.extend({ holds: holdSettingsSchema.optional() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const ready = await gatewayReady(context)
      if (input.methods.online && !ready) {
        throw new ORPCError("BAD_REQUEST", { message: "Card payment needs the Konnect live keys." })
      }
      const invalid = validatePaymentSettings(input, ready)
      if (invalid) throw new ORPCError("BAD_REQUEST", { message: invalid })
      // An older dashboard tab saves without `holds`: keep the owner's windows instead of resetting them.
      const holds = input.holds ?? (await getPaymentSettings(context.db, context.config)).holds
      await savePaymentSettings(context.db, { ...input, holds })
      return { ok: true as const }
    }),
}

export const uploadsRouter = {
  sign: adminProcedure
    .route({
      method: "POST",
      path: "/admin/uploads",
      summary: "A signed url to upload one image straight to the bucket",
      tags: TAG,
    })
    .input(uploadSignSchema)
    .output(uploadTargetSchema)
    .handler(async ({ context, input }) => {
      const { storage } = context
      if (!storage) throw new ORPCError("PRECONDITION_FAILED", { message: "Image storage is not configured here." })
      const key = `${storage.prefix}${input.folder}/${crypto.randomUUID()}.${EXTENSIONS[input.contentType]}`
      await reserveUpload(context.db, { key, folder: input.folder, contentType: input.contentType, bytes: input.size })
      return {
        uploadUrl: await storage.presignPut(key, input.contentType, input.size),
        image: `s3:${key}`,
        publicUrl: await storage.readUrl(key),
      }
    }),
  usage: adminProcedure
    .route({ method: "GET", path: "/admin/uploads/usage", summary: "Storage used against the plan", tags: TAG })
    .output(storageUsageSchema)
    .handler(({ context }) => storageUsage(context.db)),
}
