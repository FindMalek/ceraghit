import { z } from "zod"

/** Field lists only, never values: the dashboard renders a mask per secret field. */
export const INTEGRATIONS = {
  konnect: { secretFields: ["apiKey"], configFields: ["walletId", "mode"] },
  aramex: { secretFields: ["password", "accountPin"], configFields: [] },
  groq: { secretFields: ["apiKey"], configFields: [] },
} as const satisfies Record<string, { secretFields: readonly string[]; configFields: readonly string[] }>

export type IntegrationProvider = keyof typeof INTEGRATIONS
export const INTEGRATION_PROVIDERS = Object.keys(INTEGRATIONS) as IntegrationProvider[]
export const integrationProviderSchema = z.enum(["konnect", "aramex", "groq"])

/** Strict: only known non-secret keys, so nothing secret can be parked in `config` in clear. Owning issues extend them. */
export const konnectConfigSchema = z
  .object({ walletId: z.string().max(200).optional(), mode: z.enum(["test", "live"]).optional() })
  .strict()
export const aramexConfigSchema = z.object({}).strict()
export const groqConfigSchema = z.object({}).strict()
export const INTEGRATION_CONFIG_SCHEMAS = {
  konnect: konnectConfigSchema,
  aramex: aramexConfigSchema,
  groq: groqConfigSchema,
} as const

export const maskedSecretSchema = z.object({ configured: z.boolean(), hint: z.string().nullable() })
export const maskedIntegrationSchema = z.object({
  provider: integrationProviderSchema,
  config: z.record(z.string(), z.unknown()),
  secrets: z.record(z.string(), maskedSecretSchema),
  source: z.enum(["db", "env", "none"]),
  vaultAvailable: z.boolean(),
  updatedAt: z.string().nullable(),
})
export type MaskedIntegration = z.infer<typeof maskedIntegrationSchema>

export const saveIntegrationInputSchema = z.object({
  provider: integrationProviderSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  /** Omitted field keeps the stored value, null clears it, a string replaces it. */
  secrets: z.record(z.string(), z.string().trim().min(1).max(500).nullable()).optional(),
})
