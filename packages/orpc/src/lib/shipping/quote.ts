import {
  type Currency,
  estimateShipping,
  type ShippingEstimate,
  type ShippingItem,
  type ShippingRates,
} from "@workspace/sdk"
import type { Services } from "../../context"
import { getSettings } from "../settings"
import { getShopProfile } from "../shop-profile"
import { resolveShipping } from "./resolve"
import { getShippingSettings } from "./settings"
import type { Parcel, ShipAddress, ShippingProvider } from "./types"

export type FallbackReason = "disabled" | "no-city" | "timeout" | "error" | "currency"

export type ShippingQuoteResult = ShippingEstimate & { source: "aramex" | "flat"; fallbackReason?: FallbackReason }

export interface ShippingQuoteInput {
  lines: ShippingItem[]
  country: string
  city?: string
  postalCode?: string
  currency: Currency
  subtotalMinor: number
}

const QUOTE_TIMEOUT_MS = 4000
const OK_TTL_MS = 15 * 60_000
const ERROR_TTL_MS = 60_000
const MAX_ENTRIES = 500

interface CacheEntry {
  expires: number
  /** The amount Aramex quoted, or the reason it could not. */
  value: { amountMinor: number } | { fallback: FallbackReason }
}
const cache = new Map<string, CacheEntry>()

const normalise = (text: string | undefined) =>
  (text ?? "").trim().toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step

/**
 * One parcel: the summed weight with the same packaging as the flat rates. The box is the widest footprint with every
 * piece stacked on top of the others, so volume priced rates never see a box smaller than the cart.
 */
export function parcelFor(rates: ShippingRates, lines: ShippingItem[]): Parcel {
  const grams = lines.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0)
  return {
    weightGrams: Math.ceil(grams * (1 + rates.packagingPct / 100) + rates.packagingGrams),
    lengthCm: Math.max(1, ...lines.map((l) => l.lengthCm)),
    widthCm: Math.max(1, ...lines.map((l) => l.widthCm)),
    heightCm: Math.max(
      1,
      lines.reduce((sum, l) => sum + l.heightCm * l.quantity, 0),
    ),
    pieces: 1,
  }
}

function remember(key: string, value: CacheEntry["value"], ttl: number, now: number): void {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(key, { expires: now + ttl, value })
}

/** Asks the provider for a price with a short timeout. Never throws: every failure is a reason to use the flat rate. */
export async function providerAmount(
  provider: ShippingProvider,
  req: { from: ShipAddress; to: ShipAddress; parcel: Parcel; currency: Currency },
  now: number,
  cacheKey: string,
  timeoutMs = QUOTE_TIMEOUT_MS,
): Promise<{ amountMinor: number } | { fallback: FallbackReason }> {
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > now) return hit.value
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const quote = await Promise.race([
      provider.quote(req),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs)
      }),
    ])
    if (quote === "timeout") {
      remember(cacheKey, { fallback: "timeout" }, ERROR_TTL_MS, now)
      return { fallback: "timeout" }
    }
    // Aramex prices in its own currency, we never convert one into the other.
    if (!quote || quote.currency !== req.currency) {
      remember(cacheKey, { fallback: "currency" }, ERROR_TTL_MS, now)
      return { fallback: "currency" }
    }
    remember(cacheKey, { amountMinor: quote.amountMinor }, OK_TTL_MS, now)
    return { amountMinor: quote.amountMinor }
  } catch {
    remember(cacheKey, { fallback: "error" }, ERROR_TTL_MS, now)
    return { fallback: "error" }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The delivery price of a cart. Always starts from the flat zone rates: their limits (too heavy, too long, no zone)
 * and the free-delivery threshold still win. When the owner turned Aramex pricing on and a city is known, Aramex's rate
 * plus the zone handling replaces the flat amount; every failure falls back to the flat rate.
 */
export async function quoteShipping(services: Services, input: ShippingQuoteInput): Promise<ShippingQuoteResult> {
  const { shippingRates: rates } = await getSettings(services.db)
  const flat = estimateShipping(rates, input.lines, input.country, input.currency, input.subtotalMinor)
  const flatResult = (fallbackReason?: FallbackReason): ShippingQuoteResult => ({
    ...flat,
    source: "flat",
    ...(fallbackReason ? { fallbackReason } : {}),
  })
  if (!flat.available || flat.freeApplied) return flatResult()

  const mode = await getShippingSettings(services.db).catch(() => null)
  if (!mode) return flatResult("error")
  if (mode.provider !== "aramex" || !mode.quoteFromProvider) return flatResult("disabled")
  if (!input.city?.trim()) return flatResult("no-city")

  let answer: Awaited<ReturnType<typeof providerAmount>>
  try {
    const { provider, degraded } = await resolveShipping(services)
    if (degraded) return flatResult("error")
    const profile = await getShopProfile(services.db)
    const from: ShipAddress = {
      name: profile.displayName ?? profile.legalName ?? "Ceraghit",
      phone: profile.phones[0] ?? "",
      line1: profile.address ?? "",
      city: profile.city ?? "",
      country: profile.country,
      ...(profile.postalCode ? { postalCode: profile.postalCode } : {}),
      ...(profile.email ? { email: profile.email } : {}),
    }
    const to: ShipAddress = {
      name: "Client",
      phone: "",
      line1: "",
      city: input.city.trim(),
      country: input.country,
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
    }
    const parcel = parcelFor(rates, input.lines)
    const key = JSON.stringify([
      input.country,
      normalise(input.city),
      normalise(input.postalCode),
      input.currency,
      parcel,
      from.country,
      from.city,
      normalise(from.postalCode),
    ])
    answer = await providerAmount(
      provider,
      { from, to, parcel, currency: input.currency },
      services.now().getTime(),
      key,
    )
  } catch {
    return flatResult("error")
  }
  if ("fallback" in answer) return flatResult(answer.fallback)

  const zone = rates.zones.find((z) => z.id === flat.zoneId)
  const handling = zone?.handling[input.currency] ?? 0
  const step = input.currency === "TND" ? 500 : 50
  return { ...flat, amountMinor: ceilTo(answer.amountMinor + handling, step), source: "aramex" }
}

/** For tests: forget everything cached. */
export function clearShippingQuoteCache(): void {
  cache.clear()
}
