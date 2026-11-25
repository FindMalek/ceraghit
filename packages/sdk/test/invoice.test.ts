import { expect, test } from "bun:test"
import { INVOICE_COPY } from "../src/invoice"
import { paymentMethodSchema } from "../src/schemas"

test("invoice copy has the same keys in fr, en and ar", () => {
  const keys = Object.keys(INVOICE_COPY.fr).sort()
  expect(Object.keys(INVOICE_COPY.en).sort()).toEqual(keys)
  expect(Object.keys(INVOICE_COPY.ar).sort()).toEqual(keys)
})

test("every payment method has its own label on the invoice in every language", () => {
  for (const locale of ["fr", "en", "ar"] as const)
    for (const method of paymentMethodSchema.options) expect(INVOICE_COPY[locale][method]).toBeTruthy()
})
