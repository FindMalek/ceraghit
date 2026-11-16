import { ORPCError } from "@orpc/server"
import { mediaSchema, mediaSignResultSchema, mediaSignSchema } from "@workspace/sdk"
import { z } from "zod"
import { confirmMedia, signMedia } from "../../lib/media"
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
}
