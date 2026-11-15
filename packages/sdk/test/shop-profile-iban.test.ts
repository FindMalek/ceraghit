import { expect, test } from "bun:test"
import { shopProfileInputSchema } from "../src/schemas"

test("an IBAN with a wrong checksum is refused, a correct one is compacted", () => {
  expect(shopProfileInputSchema.safeParse({ bankIban: "TN59 1000 6035 1835 9847 8832" }).success).toBe(false)
  expect(shopProfileInputSchema.parse({ bankIban: "tn59 1000 6035 1835 9847 8831" }).bankIban).toBe(
    "TN5910006035183598478831",
  )
})
