import { expect, test } from "bun:test"
import { INVOICE_COPY } from "../src/invoice"

test("invoice copy has the same keys in fr, en and ar", () => {
  const keys = Object.keys(INVOICE_COPY.fr).sort()
  expect(Object.keys(INVOICE_COPY.en).sort()).toEqual(keys)
  expect(Object.keys(INVOICE_COPY.ar).sort()).toEqual(keys)
})
