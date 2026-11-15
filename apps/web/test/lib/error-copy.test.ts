import { expect, test } from "bun:test"
import { lengthParity, PARITY_BANDS } from "@workspace/sdk"
import { detectLocale, errorCopy, notFoundCopy } from "../../lib/error-copy"

test("detectLocale reads the url prefix, then the html lang, then falls back to fr", () => {
  expect(detectLocale("/ar/shop", "fr")).toBe("ar")
  expect(detectLocale("/shop", "en")).toBe("en")
  expect(detectLocale("/shop", "")).toBe("fr")
})

test("the error page copy is about as long in en and ar as in fr", () => {
  for (const lang of ["en", "ar"] as const) {
    for (const key of ["title", "text", "retry"] as const) {
      expect(lengthParity(errorCopy("fr")[key], errorCopy(lang)[key], PARITY_BANDS[lang]).ok).toBe(true)
    }
    for (const key of ["title", "text", "home"] as const) {
      expect(lengthParity(notFoundCopy("fr")[key], notFoundCopy(lang)[key], PARITY_BANDS[lang]).ok).toBe(true)
    }
  }
})
