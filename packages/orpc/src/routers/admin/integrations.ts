import {
  INTEGRATION_PROVIDERS,
  integrationProviderSchema,
  maskedIntegrationSchema,
  saveIntegrationInputSchema,
} from "@workspace/sdk"
import { z } from "zod"
import { clearIntegration, describeIntegration, saveIntegration } from "../../lib/integrations"
import { assertKonnectUnlocked } from "../../lib/orders"
import { assertKonnectMode } from "../../lib/payments"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const providerInput = z.object({ provider: integrationProviderSchema })

/** Secrets are write-only: every output is masked, the values never leave the server. */
export const integrationsRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/integrations", summary: "Provider credentials, masked", tags: TAG })
    .input(z.object({}))
    .output(z.array(maskedIntegrationSchema))
    .handler(({ context }) => Promise.all(INTEGRATION_PROVIDERS.map((p) => describeIntegration(context, p)))),

  get: adminProcedure
    .route({
      method: "GET",
      path: "/admin/integrations/{provider}",
      summary: "One provider's credentials, masked",
      tags: TAG,
    })
    .input(providerInput)
    .output(maskedIntegrationSchema)
    .handler(({ context, input }) => describeIntegration(context, input.provider)),

  save: adminProcedure
    .route({
      method: "PUT",
      path: "/admin/integrations/{provider}",
      summary: "Save or replace provider credentials",
      tags: TAG,
    })
    .input(saveIntegrationInputSchema)
    .output(maskedIntegrationSchema)
    .handler(async ({ context, input }) => {
      const mode = input.provider === "konnect" ? input.config?.mode : undefined
      if (mode === "test" || mode === "live") assertKonnectMode(context.config.appEnv, mode)
      if (input.provider === "konnect") {
        const walletId = input.config?.walletId
        await assertKonnectUnlocked(context, {
          ...(input.secrets && "apiKey" in input.secrets ? { apiKey: input.secrets.apiKey ?? null } : {}),
          ...(typeof walletId === "string" ? { walletId } : {}),
          ...(mode === "test" || mode === "live" ? { mode } : {}),
        })
      }
      await saveIntegration(context, context.admin.id, input.provider, { config: input.config, secrets: input.secrets })
      return describeIntegration(context, input.provider)
    }),

  clear: adminProcedure
    .route({ method: "DELETE", path: "/admin/integrations/{provider}", summary: "Remove saved credentials", tags: TAG })
    .input(providerInput)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      if (input.provider === "konnect") await assertKonnectUnlocked(context, "clear")
      await clearIntegration(context.db, input.provider, context.admin.id, context.now())
      return { ok: true as const }
    }),
}
