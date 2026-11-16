import { ORPCError } from "@orpc/server"
import {
  mediaDetailSchema,
  mediaListQuerySchema,
  mediaListSchema,
  mediaSchema,
  mediaSignResultSchema,
  mediaSignSchema,
  mediaTagSchema,
  mediaUpdateSchema,
} from "@workspace/sdk"
import { z } from "zod"
import {
  confirmMedia,
  getMediaDetail,
  listMedia,
  mediaTags,
  removeMedia,
  signMedia,
  updateMedia,
} from "../../lib/media"
import { enforceLimit } from "../../lib/rate-limit"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const NO_STORAGE = "Image storage is not configured here."

export const mediaRouter = {
  sign: adminProcedure
    .route({
      method: "POST",
      path: "/admin/media/sign",
      summary: "Reserve an upload or return the same image already in the library",
      tags: TAG,
    })
    .input(mediaSignSchema)
    .output(mediaSignResultSchema)
    .handler(async ({ context, input }) => {
      if (!context.storage) throw new ORPCError("PRECONDITION_FAILED", { message: NO_STORAGE })
      await enforceLimit(context, "mediaSign", "too_many_uploads", "Too many uploads, try again in a few minutes.")
      return signMedia(context.db, context.storage, input)
    }),

  confirm: adminProcedure
    .route({
      method: "POST",
      path: "/admin/media/{id}/confirm",
      summary: "Check the uploaded file and add it to the library",
      tags: TAG,
    })
    .input(z.object({ id: z.string().uuid() }))
    .output(mediaSchema)
    .handler(async ({ context, input }) => {
      if (!context.storage) throw new ORPCError("PRECONDITION_FAILED", { message: NO_STORAGE })
      await enforceLimit(context, "mediaConfirm", "too_many_uploads", "Too many uploads, try again in a few minutes.")
      return confirmMedia(context.db, context.storage, input.id)
    }),

  list: adminProcedure
    .route({ method: "GET", path: "/admin/media", summary: "Search and page through the library", tags: TAG })
    .input(mediaListQuerySchema)
    .output(mediaListSchema)
    .handler(({ context, input }) => listMedia(context.db, input)),

  tags: adminProcedure
    .route({ method: "GET", path: "/admin/media/tags", summary: "Tags in use with their counts", tags: TAG })
    .output(z.array(mediaTagSchema))
    .handler(({ context }) => mediaTags(context.db)),

  get: adminProcedure
    .route({ method: "GET", path: "/admin/media/{id}", summary: "One image with where it is used", tags: TAG })
    .input(z.object({ id: z.string().uuid() }))
    .output(mediaDetailSchema)
    .handler(({ context, input }) => getMediaDetail(context.db, input.id)),

  update: adminProcedure
    .route({ method: "PATCH", path: "/admin/media/{id}", summary: "Rename, describe, tag or pin an image", tags: TAG })
    .input(mediaUpdateSchema)
    .output(mediaSchema)
    .handler(({ context, input }) => updateMedia(context.db, input)),

  remove: adminProcedure
    .route({ method: "DELETE", path: "/admin/media/{id}", summary: "Delete an image that is not used", tags: TAG })
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "mediaRemove", "too_many_uploads", "Too many deletions, try again in a few minutes.")
      await removeMedia(context.db, context.storage, input.id)
      return { ok: true as const }
    }),
}
