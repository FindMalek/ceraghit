import { siteImagesSchema, siteSlotInputSchema } from "@workspace/sdk"
import { z } from "zod"
import { getSiteImages, saveSlot } from "../../lib/site-images"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

export const siteRouter = {
  images: adminProcedure
    .route({
      method: "GET",
      path: "/admin/site/images",
      summary: "Every site picture by slot, hidden included",
      tags: TAG,
    })
    .output(siteImagesSchema)
    .handler(({ context }) => getSiteImages(context.db)),

  saveSlot: adminProcedure
    .route({ method: "PUT", path: "/admin/site/images/{slot}", summary: "Replace the pictures of one slot", tags: TAG })
    .input(siteSlotInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveSlot(context.db, input)
      return { ok: true as const }
    }),
}
