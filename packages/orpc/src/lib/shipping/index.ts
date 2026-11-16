import { AramexClient, type AramexCredentials } from "./aramex/client"
import { ARAMEX_HOSTS } from "./aramex/endpoints"
import { type AramexConfig, AramexShippingProvider, DEFAULT_ARAMEX_CONFIG } from "./aramex/provider"
import { ManualShippingProvider } from "./manual"
import type { ShippingProvider, ShippingProviderId } from "./types"

export interface ShippingDeps {
  aramex?: {
    credentials: AramexCredentials
    mode: "test" | "live"
    config?: Partial<AramexConfig>
    fetch?: typeof fetch
    timeoutMs?: number
  }
}

export function createShippingProvider(kind: ShippingProviderId, deps: ShippingDeps = {}): ShippingProvider {
  if (kind === "manual") return new ManualShippingProvider()
  const a = deps.aramex
  if (!a) throw new Error("Aramex is not configured")
  const client = new AramexClient({
    host: ARAMEX_HOSTS[a.mode],
    credentials: a.credentials,
    ...(a.fetch ? { fetch: a.fetch } : {}),
    ...(a.timeoutMs ? { timeoutMs: a.timeoutMs } : {}),
  })
  return new AramexShippingProvider(client, { ...DEFAULT_ARAMEX_CONFIG, ...a.config }, a.fetch ?? fetch, a.timeoutMs)
}

export { AramexError } from "./aramex/errors"
export { ShippingError } from "./errors"
export { ManualShippingProvider } from "./manual"
export type * from "./types"
