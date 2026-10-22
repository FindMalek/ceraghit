import { ORPCError } from "@orpc/server"
import { locations } from "@workspace/db"
import {
  locationInputSchema,
  locationSchema,
  studioSettingsSchema,
  uploadSignSchema,
  uploadTargetSchema,
} from "@workspace/sdk"
import { asc, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { getSettings, saveSettings } from "../../lib/settings"
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

export const settingsRouter = {
  get: adminProcedure
    .route({ method: "GET", path: "/admin/settings", summary: "Contact details and delivery fees", tags: TAG })
    .output(studioSettingsSchema)
    .handler(({ context }) => getSettings(context.db)),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/settings", summary: "Save settings", tags: TAG })
    .input(studioSettingsSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveSettings(context.db, input)
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
      return {
        uploadUrl: await storage.presignPut(key, input.contentType),
        image: `s3:${key}`,
        publicUrl: await storage.readUrl(key),
      }
    }),
}
