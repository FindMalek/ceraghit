import { expect, test } from "bun:test"
import { formatMoney, imageSrc, pick, toMinor } from "./format"

test("the same product shows its TND and EUR price", () => {
  expect(formatMoney(60_000, "TND", "en")).toBe("60 DT")
  expect(formatMoney(42_500, "TND", "en")).toBe("42.5 DT")
  expect(formatMoney(3_400, "EUR", "en")).toBe("34 €")
  expect(formatMoney(3_400, "EUR", "ar")).toBe("\u206634 €\u2069")
  expect(formatMoney(60_000, "TND", "ar")).toBe("\u206660 د.ت\u2069")
  expect(toMinor(10, "TND")).toBe(10_000)
  expect(toMinor(34.5, "EUR")).toBe(3_450)
})

test("a missing translation falls back to french", () => {
  expect(pick({ fr: "Lampe", en: "Lamp" }, "en")).toBe("Lamp")
  expect(pick({ fr: "Lampe" }, "ar")).toBe("Lampe")
})

test("uploaded images go through the api, static ones stay on the web app", () => {
  expect(imageSrc("s3:products/a.jpg")).toBe("/api/files/products/a.jpg")
  expect(imageSrc("/catalogue/0010.jpg", "https://ceraghit.example")).toBe(
    "https://ceraghit.example/catalogue/0010.jpg",
  )
})
