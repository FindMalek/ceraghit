import { expect, test } from "bun:test"
import { fitWithin, formatMoney, imageSrc, pick, slugify, toMinor } from "./format"

test("the same product shows its TND and EUR price", () => {
  expect(formatMoney(60_000, "TND", "en")).toBe("60 DT")
  expect(formatMoney(42_500, "TND", "en")).toBe("42.5 DT")
  expect(formatMoney(3_400, "EUR", "en")).toBe("34 €")
  expect(formatMoney(3_400, "EUR", "ar")).toBe("\u206634 €\u2069")
  expect(formatMoney(60_000, "TND", "ar")).toBe("\u206660 د.ت\u2069")
  expect(toMinor(10, "TND")).toBe(10_000)
  expect(toMinor(34.5, "EUR")).toBe(3_450)
})

test("slugs keep accented letters and ligatures readable", () => {
  expect(slugify("Bas-relief en céramique")).toBe("bas-relief-en-ceramique")
  expect(slugify("Œuvre à l'unité, Ça va")).toBe("oeuvre-a-l-unite-ca-va")
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

test("a big photo is scaled to the long side, a small one is left alone", () => {
  expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 })
  expect(fitWithin(3000, 4000, 2400)).toEqual({ width: 1800, height: 2400 })
  expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 })
})
