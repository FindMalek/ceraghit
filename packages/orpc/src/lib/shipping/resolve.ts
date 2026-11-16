import { ORPCError } from "@orpc/server"
import { aramexConfigSchema, type ConnectionTestResult } from "@workspace/sdk"
import type { Services } from "../../context"
import { assertVaultReadable, getIntegration } from "../integrations"
import type { AramexCredentials } from "./aramex/client"
import { DEFAULT_ARAMEX_CONFIG } from "./aramex/provider"
import { createShippingProvider, type ShippingDeps } from "./index"
import { getShippingSettings } from "./settings"
import type { ShippingProvider } from "./types"

export const LIVE_ONLY_PRODUCTION = "Le mode réel Aramex n'est autorisé qu'en production."
export const LIVE_NEEDS_CONFIRMATION = "Confirmez les types de produit avec Aramex avant d'activer le mode réel."
const MISSING = "Renseignez et testez les identifiants Aramex avant de l'activer."

export interface AramexInputs {
  config: Record<string, unknown>
  secrets: Record<string, string>
}

export function aramexComplete({ config, secrets }: AramexInputs): boolean {
  return !!(config.userName && config.accountNumber && config.accountEntity && secrets.password && secrets.accountPin)
}

/** Live only in production and only once the product types are confirmed; everywhere else the test host. */
export function effectiveMode(services: Services, config: Record<string, unknown>): "test" | "live" {
  return config.mode === "live" && services.config.appEnv === "production" && config.productTypesConfirmed === true
    ? "live"
    : "test"
}

export function aramexDeps(services: Services, input: AramexInputs, timeoutMs?: number): ShippingDeps {
  const parsed = aramexConfigSchema.safeParse(input.config)
  const config = parsed.success ? parsed.data : {}
  const mode = effectiveMode(services, config)
  const credentials: AramexCredentials = {
    userName: config.userName ?? "",
    password: input.secrets.password ?? "",
    accountNumber: config.accountNumber ?? "",
    accountPin: input.secrets.accountPin ?? "",
    accountEntity: config.accountEntity ?? DEFAULT_ARAMEX_CONFIG.accountEntity,
    accountCountryCode: config.accountCountryCode ?? DEFAULT_ARAMEX_CONFIG.accountCountry,
    version: "v1.0",
    source: null,
  }
  const productTypes = { ...DEFAULT_ARAMEX_CONFIG.productTypes, ...config.productTypes }
  return {
    aramex: {
      credentials,
      mode,
      ...(services.http ? { fetch: services.http } : {}),
      ...(timeoutMs ? { timeoutMs, retries: 0 } : {}),
      config:
        mode === "live"
          ? {
              productTypes,
              labelReportId: DEFAULT_ARAMEX_CONFIG.labelReportId,
              paymentType: DEFAULT_ARAMEX_CONFIG.paymentType,
              deliveredCodes: DEFAULT_ARAMEX_CONFIG.deliveredCodes,
            }
          : { productTypes },
    },
  }
}

export async function resolveShipping(
  services: Services,
): Promise<{ provider: ShippingProvider; degraded: "missing-credentials" | null }> {
  const mode = await getShippingSettings(services.db)
  if (mode.provider === "manual") return { provider: createShippingProvider("manual"), degraded: null }
  await assertVaultReadable(services)
  const found = await getIntegration(services, "aramex")
  if (!found || !aramexComplete(found)) {
    return { provider: createShippingProvider("manual"), degraded: "missing-credentials" }
  }
  return { provider: createShippingProvider("aramex", aramexDeps(services, found)), degraded: null }
}

export async function resolveShippingProvider(services: Services): Promise<ShippingProvider> {
  return (await resolveShipping(services)).provider
}

const STEP_MESSAGES = {
  login: {
    ok: "Connexion à Aramex réussie.",
    ko: "Identifiants refusés par Aramex. Vérifiez le nom d'utilisateur, le mot de passe, le numéro de compte et le PIN.",
  },
  rate: {
    ok: "Calcul d'un tarif réussi.",
    ko: "Identifiants reconnus, mais le tarif n'a pas pu être calculé. Vérifiez l'entité du compte et les types de produit.",
  },
} as const
const UNREACHABLE = "Aramex ne répond pas. Réessayez dans un instant."

/** Fixed French messages only: nothing the provider said and no credential ever reaches the owner's screen. */
export async function runConnectionTest(services: Services, input: AramexInputs): Promise<ConnectionTestResult> {
  if (!aramexComplete(input)) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Renseignez tous les identifiants avant de tester la connexion à Aramex." })
  }
  if (
    input.config.mode === "live" &&
    services.config.appEnv === "production" &&
    input.config.productTypesConfirmed !== true
  ) {
    throw new ORPCError("PRECONDITION_FAILED", { message: LIVE_NEEDS_CONFIRMATION })
  }
  const provider = createShippingProvider("aramex", aramexDeps(services, input, 8000))
  const step = (name: "login" | "rate", ok: boolean, message?: string) => ({
    name,
    ok,
    message: message ?? STEP_MESSAGES[name][ok ? "ok" : "ko"],
  })
  try {
    const result = await provider.testConnection()
    if (result.ok) return { ok: true, steps: [step("login", true), step("rate", true)] }
    return {
      ok: false,
      steps: result.step === "login" ? [step("login", false)] : [step("login", true), step("rate", false)],
    }
  } catch {
    return { ok: false, steps: [step("login", false, UNREACHABLE)] }
  }
}

export { MISSING as ARAMEX_MISSING }

/** `<provider>:<environment>` for /health, no secrets. */
export async function shippingHealth(services: Services): Promise<string> {
  const { provider, degraded } = await resolveShipping(services).catch(() => ({ provider: null, degraded: null }))
  if (!provider) return "manual:none"
  if (provider.id === "manual") return degraded ? "manual:degraded" : "manual:none"
  const found = await getIntegration(services, "aramex")
  return `aramex:${effectiveMode(services, found?.config ?? {})}`
}
