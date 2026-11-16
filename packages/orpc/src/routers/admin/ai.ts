import { aiSettingsSchema, aiStatusSchema, aiTranslateInputSchema, aiTranslateOutputSchema } from "@workspace/sdk"
import { z } from "zod"
import { getAiSettings, saveAiSettings } from "../../lib/settings"
import { getAiStatus, translateField } from "../../lib/translate/translate"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

export const aiRouter = {
  status: adminProcedure
    .route({ method: "GET", path: "/admin/ai/status", summary: "AI key, model, usage and monthly cap", tags: TAG })
    .output(aiStatusSchema)
    .handler(({ context }) => getAiStatus(context)),

  translate: adminProcedure
    .route({
      method: "POST",
      path: "/admin/ai/translate",
      summary: "Draft the missing languages of one field",
      tags: TAG,
    })
    .input(aiTranslateInputSchema)
    .output(aiTranslateOutputSchema)
    .handler(({ context, input }) => translateField(context, input)),

  settings: adminProcedure
    .route({ method: "GET", path: "/admin/ai/settings", summary: "AI model, effort and monthly cap", tags: TAG })
    .output(aiSettingsSchema)
    .handler(({ context }) => getAiSettings(context.db)),

  saveSettings: adminProcedure
    .route({ method: "PUT", path: "/admin/ai/settings", summary: "Save AI model, effort and monthly cap", tags: TAG })
    .input(aiSettingsSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await saveAiSettings(context.db, input)
      return { ok: true as const }
    }),
}
