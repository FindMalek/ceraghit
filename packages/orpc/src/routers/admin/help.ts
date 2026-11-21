import {
  parseTutorialManifest,
  TUTORIAL_MANIFEST_KEY,
  tutorialLinksSchema,
  tutorialManifestSchema,
} from "@workspace/sdk"
import { z } from "zod"
import { getTutorialLinks, saveTutorialLinks } from "../../lib/settings"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const MANIFEST_MAX_BYTES = 256 * 1024

export const helpRouter = {
  get: adminProcedure
    .route({ method: "GET", path: "/admin/help", summary: "Tutorial video ids", tags: TAG })
    .output(tutorialLinksSchema)
    .handler(({ context }) => getTutorialLinks(context.db)),

  library: adminProcedure
    .route({ method: "GET", path: "/admin/help/library", summary: "Tutorial files in the bucket", tags: TAG })
    .output(z.object({ manifest: tutorialManifestSchema, prefix: z.string() }))
    .handler(async ({ context }) => {
      const { storage } = context
      const bytes = storage
        ? await storage.read(`${storage.prefix}${TUTORIAL_MANIFEST_KEY}`, MANIFEST_MAX_BYTES).catch(() => null)
        : null
      return {
        manifest: parseTutorialManifest(bytes ? new TextDecoder().decode(bytes) : null),
        prefix: storage?.prefix ?? "",
      }
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/help", summary: "Save tutorial video ids", tags: TAG })
    .input(tutorialLinksSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveTutorialLinks(context.db, input)
      return { ok: true as const }
    }),
}
