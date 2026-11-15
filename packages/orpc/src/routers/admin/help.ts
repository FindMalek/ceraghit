import { tutorialLinksSchema } from "@workspace/sdk"
import { z } from "zod"
import { getTutorialLinks, saveTutorialLinks } from "../../lib/settings"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

export const helpRouter = {
  get: adminProcedure
    .route({ method: "GET", path: "/admin/help", summary: "Tutorial video ids", tags: TAG })
    .output(tutorialLinksSchema)
    .handler(({ context }) => getTutorialLinks(context.db)),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/help", summary: "Save tutorial video ids", tags: TAG })
    .input(tutorialLinksSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveTutorialLinks(context.db, input)
      return { ok: true as const }
    }),
}
