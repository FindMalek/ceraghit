import { AramexClient, type AramexCredentials } from "./aramex/client"
import { ARAMEX_HOSTS } from "./aramex/endpoints"
import { type AramexConfig, AramexShippingProvider, DEFAULT_ARAMEX_CONFIG } from "./aramex/provider"
import { ShippingError } from "./errors"
import { ManualShippingProvider } from "./manual"
import type { ShippingProvider, ShippingProviderId } from "./types"

export interface ShippingDeps {
  aramex?: {
    credentials: AramexCredentials
    mode: "test" | "live"
    config?: Partial<AramexConfig>
    fetch?: typeof fetch
    /** Per call: 4000 for checkout quotes, 20000 for creating a shipment. */
    timeoutMs?: number
    /** 0 for anything that must not be repeated. */
    retries?: number
  }
}

/** The defaults are unverified guesses (docs/aramex.md): live must name these explicitly until #198 verifies them. */
const LIVE_REQUIRED = ["productTypes", "labelReportId", "paymentType", "deliveredCodes"] as const

export function createShippingProvider(kind: ShippingProviderId, deps: ShippingDeps = {}): ShippingProvider {
  if (kind === "manual") return new ManualShippingProvider()
  const a = deps.aramex
  if (!a) throw new ShippingError("invalid-request")
  if (a.mode === "live" && LIVE_REQUIRED.some((key) => a.config?.[key] === undefined)) {
    throw new ShippingError("invalid-request")
  }
  const config: AramexConfig = {
    ...DEFAULT_ARAMEX_CONFIG,
    accountCountry: a.credentials.accountCountryCode || DEFAULT_ARAMEX_CONFIG.accountCountry,
    accountEntity: a.credentials.accountEntity || DEFAULT_ARAMEX_CONFIG.accountEntity,
    ...a.config,
  }
  const http = a.fetch ?? fetch
  const client = new AramexClient({
    host: ARAMEX_HOSTS[a.mode],
    credentials: a.credentials,
    fetch: http,
    ...(a.timeoutMs ? { timeoutMs: a.timeoutMs } : {}),
    ...(a.retries !== undefined ? { retries: a.retries } : {}),
  })
  return new AramexShippingProvider(client, config, http, a.timeoutMs)
}

export { AramexError } from "./aramex/errors"
export { ShippingError } from "./errors"
export { ManualShippingProvider } from "./manual"
export type * from "./types"
