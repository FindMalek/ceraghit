import { expect, test } from "bun:test"
import { DEFAULT_SHIPPING_RATES, estimateShipping } from "./shipping"

const lamp = { weightGrams: 1500, lengthCm: 24, widthCm: 24, heightCm: 24, quantity: 1 }

test("a lamp to Belgium is billed on the larger of packed and volumetric weight, plus fuel and handling", () => {
  const eu = estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "BE", "EUR")
  expect(eu.zoneName).toBe("Europe")
  expect(eu.volumetricKg).toBeCloseTo(2.7648, 3)
  expect(eu.chargeableKg).toBe(3)
  expect(eu.amountMinor).toBe(8_800)
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "TN", "TND").amountMinor).toBe(11_000)
})

test("a heavy or very long piece gets no price instead of a wrong one", () => {
  const relief = { weightGrams: 40_000, lengthCm: 60, widthCm: 60, heightCm: 10, quantity: 1 }
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [relief], "FR", "EUR")).toMatchObject({
    available: false,
    reason: "too-heavy",
  })
  const fountain = { weightGrams: 5_000, lengthCm: 180, widthCm: 10, heightCm: 10, quantity: 1 }
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [fountain], "FR", "EUR")).toMatchObject({
    available: false,
    reason: "too-long",
  })
})

test("unlisted destinations fall into the world zone", () => {
  expect(estimateShipping(DEFAULT_SHIPPING_RATES, [lamp], "US", "EUR").zoneName).toBe("Reste du monde")
})
