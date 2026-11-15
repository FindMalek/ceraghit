import { expect, test } from "bun:test"
import { lengthParity, PARITY_BANDS, visibleText } from "../src/i18n-parity"

test("fails when the ratio is out of band and the gap is over the slack", () => {
  expect(lengthParity("Paiement en espèces à la livraison", "Cash", PARITY_BANDS.en).ok).toBe(false)
})

test("passes a short label under the slack even when the ratio is off", () => {
  const result = lengthParity("Tél.", "رقم الهاتف", PARITY_BANDS.ar)
  expect(result.ratio).toBeGreaterThan(PARITY_BANDS.ar.max)
  expect(result.ok).toBe(true)
})

test("measures the rendered plural, not the ICU source", () => {
  const source = "{count, plural, zero {لا قطع} one {قطعة} two {قطعتان} few {# قطع} many {# قطعة} other {# قطعة}}"
  expect(visibleText(source, "ar")).toBe("قطعتان")
  expect(visibleText("Voir <link>la pièce</link> de {name}", "fr")).toBe("Voir la pièce de x")
})
