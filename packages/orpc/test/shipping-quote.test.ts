import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createDb, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { DEFAULT_SHIPPING_RATES, estimateShipping } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../src/context"
import { clearShippingQuoteCache, parcelFor, providerAmount, quoteShipping } from "../src/lib/shipping/quote"
import { saveShippingSettings } from "../src/lib/shipping/settings"
import type { Quote, ShippingProvider } from "../src/lib/shipping/types"

const address = { name: "A", phone: "1", line1: "x", city: "Tunis", country: "TN" }
const parcel = { weightGrams: 900, lengthCm: 20, widthCm: 20, heightCm: 10, pieces: 1 }
const req = { from: address, to: { ...address, city: "Sfax" }, parcel, currency: "TND" as const }
const NOW = Date.parse("2096-03-10T10:00:00Z")

function provider(answer: () => Promise<Quote | null>): ShippingProvider & { calls: number } {
  const stub = {
    calls: 0,
    quote() {
      stub.calls += 1
      return answer()
    },
  }
  return stub as unknown as ShippingProvider & { calls: number }
}
const quote = (amountMinor: number, currency: "TND" | "EUR" = "TND"): Quote => ({
  amountMinor,
  currency,
  productGroup: "DOM",
  productType: "ONP",
  raw: null,
})

describe("provider price", () => {
  beforeEach(clearShippingQuoteCache)

  test("an answer is used and asked once for the next quarter of an hour", async () => {
    const p = provider(async () => quote(9_500))
    expect(await providerAmount(p, req, NOW, "k")).toEqual({ amountMinor: 9_500 })
    expect(await providerAmount(p, req, NOW + 60_000, "k")).toEqual({ amountMinor: 9_500 })
    expect(p.calls).toBe(1)
    await providerAmount(p, req, NOW + 16 * 60_000, "k")
    expect(p.calls).toBe(2)
  })

  test("an answer in another currency is never converted, it falls back and is remembered a minute", async () => {
    const p = provider(async () => quote(9_500, "EUR"))
    expect(await providerAmount(p, req, NOW, "k")).toEqual({ fallback: "currency" })
    await providerAmount(p, req, NOW + 30_000, "k")
    expect(p.calls).toBe(1)
    await providerAmount(p, req, NOW + 90_000, "k")
    expect(p.calls).toBe(2)
  })

  test("no price from the provider falls back", async () => {
    expect(
      await providerAmount(
        provider(async () => null),
        req,
        NOW,
        "k",
      ),
    ).toEqual({ fallback: "currency" })
  })

  test("a provider that never answers falls back after the timeout", async () => {
    const p = provider(() => new Promise<Quote | null>(() => {}))
    const started = Date.now()
    expect(await providerAmount(p, req, NOW, "k", 30)).toEqual({ fallback: "timeout" })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  test("a provider error falls back and never throws", async () => {
    const p = provider(async () => {
      throw new Error("HasErrors")
    })
    expect(await providerAmount(p, req, NOW, "k")).toEqual({ fallback: "error" })
  })
})

test("the parcel carries the flat rates' packaging and a box tall enough for every piece", () => {
  const rates = { ...DEFAULT_SHIPPING_RATES, packagingPct: 20, packagingGrams: 300 }
  const lines = [
    { weightGrams: 500, lengthCm: 30, widthCm: 10, heightCm: 10, quantity: 2 },
    { weightGrams: 1000, lengthCm: 10, widthCm: 25, heightCm: 12, quantity: 1 },
  ]
  expect(parcelFor(rates, lines)).toEqual({
    weightGrams: Math.ceil(2000 * 1.2 + 300),
    lengthCm: 30,
    widthCm: 25,
    heightCm: 10 * 2 + 12,
    pieces: 1,
  })
})

const url = process.env.DATABASE_URL
describe.skipIf(!url)("quote service", () => {
  const db = createDb(url!)
  const services = { db, now: () => new Date(NOW), config: { appEnv: "local" } } as unknown as Services
  const lines = [{ weightGrams: 1000, lengthCm: 20, widthCm: 20, heightCm: 10, quantity: 1 }]
  const input = { lines, country: "TN", currency: "TND" as const, subtotalMinor: 50_000 }

  let studioBefore: typeof settings.$inferSelect | undefined

  beforeAll(async () => {
    await runMigrations(db)
    ;[studioBefore] = await db.select().from(settings).where(eq(settings.key, "studio"))
    // the flat rates come from the studio row: start from the defaults whatever the db holds
    await db.delete(settings).where(eq(settings.key, "studio"))
    await db.delete(settings).where(eq(settings.key, "shipping"))
  })
  afterAll(async () => {
    await db.delete(settings).where(eq(settings.key, "shipping"))
    if (studioBefore)
      await db
        .insert(settings)
        .values(studioBefore)
        .onConflictDoUpdate({ target: settings.key, set: { value: studioBefore.value } })
    await db.close()
  })

  test("with the provider off the price is the flat rate, labelled flat", async () => {
    const result = await quoteShipping(services, input)
    const flat = estimateShipping(DEFAULT_SHIPPING_RATES, lines, "TN", "TND", 50_000)
    expect(result).toMatchObject({ source: "flat", fallbackReason: "disabled", amountMinor: flat.amountMinor })
  })

  test("with Aramex pricing on but no city yet the flat rate is the estimate", async () => {
    await saveShippingSettings(db, { provider: "aramex", quoteFromProvider: true })
    expect(await quoteShipping(services, input)).toMatchObject({ source: "flat", fallbackReason: "no-city" })
  })

  test("an order too heavy to ship stays unavailable even with Aramex pricing on", async () => {
    await saveShippingSettings(db, { provider: "aramex", quoteFromProvider: true })
    const heavy = [{ ...lines[0]!, weightGrams: 40_000 }]
    const result = await quoteShipping(services, { ...input, lines: heavy, city: "Sfax" })
    expect(result).toMatchObject({ available: false, reason: "too-heavy", source: "flat" })
  })

  test("Aramex pricing on without saved credentials falls back to the flat rate", async () => {
    await saveShippingSettings(db, { provider: "aramex", quoteFromProvider: true })
    const result = await quoteShipping(services, { ...input, city: "Sfax" })
    expect(result).toMatchObject({ source: "flat", fallbackReason: "error" })
  })
})
