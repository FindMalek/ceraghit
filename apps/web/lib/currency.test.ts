import { expect, test } from "bun:test"
import { detectCurrency } from "./currency"

test("Tunisia pays in dinars, every other country in euros, unknown falls back to dinars", () => {
  const at = (country?: string) => detectCurrency(new Headers(country ? { "x-vercel-ip-country": country } : {}))
  expect(at("TN")).toBe("TND")
  expect(at("be")).toBe("EUR")
  expect(at("XX")).toBe("TND")
  expect(at()).toBe("TND")
})
