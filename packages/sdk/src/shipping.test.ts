import { expect, test } from "bun:test"
import { DEFAULT_SHIPPING_RATES, estimateShipping } from "./shipping"

const lamp = { weightGrams: 1500, lengthCm: 24, widthCm: 24, heightCm: 24, quantity: 1 }

test("a lamp to Belgium is billed on the larger of packed and volumetric weight, plus fuel and handling", () => {
  const eu = estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "BE", "EUR", 3_000)
  expect(eu.zoneName).toBe("Europe")
  expect(eu.volumetricKg).toBeCloseTo(2.7648, 3)
  expect(eu.chargeableKg).toBe(3)
  expect(eu.amountMinor).toBe(8_800)
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "TN", "TND", 100_000).amountMinor).toBe(11_000)
})

test("a heavy or very long piece gets no price instead of a wrong one", () => {
  const relief = { weightGrams: 40_000, lengthCm: 60, widthCm: 60, heightCm: 10, quantity: 1 }
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [relief], "FR", "EUR", 100)).toMatchObject({
    available: false,
    reason: "too-heavy",
  })
  const fountain = { weightGrams: 5_000, lengthCm: 180, widthCm: 10, heightCm: 10, quantity: 1 }
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [fountain], "FR", "EUR", 100)).toMatchObject({
    available: false,
    reason: "too-long",
  })
})

test("unlisted destinations fall into the world zone", () => {
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "US", "EUR", 3_000).zoneName).toBe("Reste du monde")
})

test("delivery is free from the zone's threshold, only where the zone has one, never for an unavailable piece", () => {
  const below = estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "TN", "TND", 299_500)
  expect(below).toMatchObject({ amountMinor: 11_000, freeApplied: false, freeOverMinor: 300_000 })
  const at = estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "TN", "TND", 300_000)
  expect(at).toMatchObject({ available: true, amountMinor: 0, freeApplied: true })
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "BE", "EUR", 999_999)).toMatchObject({
    freeApplied: false,
    freeOverMinor: null,
  })
  const relief = { weightGrams: 40_000, lengthCm: 60, widthCm: 60, heightCm: 10, quantity: 1 }
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [relief], "TN", "TND", 999_999)).toMatchObject({
    available: false,
    reason: "too-heavy",
    freeApplied: false,
  })
})
