import { z } from "zod"

/** Field lists only, never values: the dashboard renders a mask per secret field. */
export const INTEGRATIONS = {
  aramex: {
    secretFields: ["password", "accountPin"],
    configFields: ["userName", "accountNumber", "accountEntity", "accountCountryCode", "mode"],
  },
  groq: { secretFields: ["apiKey"], configFields: [] },
} as const satisfies Record<string, { secretFields: readonly string[]; configFields: readonly string[] }>

export type IntegrationProvider = keyof typeof INTEGRATIONS
export const INTEGRATION_PROVIDERS = Object.keys(INTEGRATIONS) as IntegrationProvider[]
export const integrationProviderSchema = z.enum(["aramex", "groq"])

const aramexShipperSchema = z
  .object({
    companyName: z.string().trim().min(2).max(60),
    personName: z.string().trim().min(2).max(60),
    phone: z.string().trim().min(6).max(30),
    email: z.email().max(120),
    line1: z.string().trim().min(3).max(100),
    line2: z.string().trim().max(100).optional(),
    city: z.string().trim().min(2).max(60),
    postalCode: z.string().trim().max(10).optional(),
  })
  .strict()
/** Strict: only known non-secret keys, so nothing secret can be parked in `config` in clear. Owning issues extend them. */
export const aramexConfigSchema = z
  .object({
    userName: z.string().trim().max(200).optional(),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{4,12}$/)
      .optional(),
    accountEntity: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    accountCountryCode: z.string().trim().toUpperCase().length(2).optional(),
    mode: z.enum(["test", "live"]).optional(),
    productTypes: z
      .object({ DOM: z.string().trim().min(2).max(10), EXP: z.string().trim().min(2).max(10) })
      .strict()
      .optional(),
    /** The owner checked the product types with the Aramex rep: the only way to unlock live. */
    productTypesConfirmed: z.boolean().optional(),
    /** Unverified until #198: live needs all three set explicitly, there is no default. */
    labelReportId: z.number().int().positive().optional(),
    paymentType: z.string().trim().min(1).max(5).optional(),
    deliveredCodes: z.array(z.string().trim().min(1).max(10)).min(1).max(10).optional(),
    shipper: aramexShipperSchema.optional(),
  })
  .strict()
export type AramexConfig = z.infer<typeof aramexConfigSchema>

export const shippingSettingsSchema = z.object({
  provider: z.enum(["manual", "aramex"]).default("manual"),
  quoteFromProvider: z.boolean().default(false),
})
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>

export const connectionStepSchema = z.object({
  name: z.enum(["login", "rate"]),
  ok: z.boolean(),
  message: z.string(),
})
export const connectionResultSchema = z.object({ ok: z.boolean(), steps: z.array(connectionStepSchema) })
export type ConnectionTestResult = z.infer<typeof connectionResultSchema>

export const aramexSecretsInputSchema = z.object({
  password: z.string().trim().min(1).max(200).nullable().optional(),
  accountPin: z.string().trim().min(1).max(200).nullable().optional(),
})
export const groqConfigSchema = z.object({}).strict()
export const INTEGRATION_CONFIG_SCHEMAS = {
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

export const shippingSettingsViewSchema = z.object({
  mode: shippingSettingsSchema,
  aramex: maskedIntegrationSchema,
  appEnv: z.enum(["local", "preview", "production"]),
  degraded: z.literal("missing-credentials").nullable(),
  /** ARAMEX_FAKE: nothing is sent to Aramex, the answers come from a stand-in. */
  simulated: z.boolean(),
})

export const saveShippingInputSchema = z.object({
  mode: shippingSettingsSchema,
  aramex: z.object({ config: aramexConfigSchema, secrets: aramexSecretsInputSchema.optional() }).optional(),
})
export const testShippingInputSchema = z.object({
  config: aramexConfigSchema.optional(),
  secrets: aramexSecretsInputSchema.optional(),
})
