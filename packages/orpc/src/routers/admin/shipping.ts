import { ORPCError } from "@orpc/server"
import {
  aramexConfigSchema,
  connectionResultSchema,
  saveShippingInputSchema,
  shippingSettingsViewSchema,
  testShippingInputSchema,
} from "@workspace/sdk"
import { z } from "zod"
import { assertVaultReadable, describeIntegration, getIntegration, saveIntegration } from "../../lib/integrations"
import { enforceLimit } from "../../lib/rate-limit"
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
