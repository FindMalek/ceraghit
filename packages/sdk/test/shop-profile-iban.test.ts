import { expect, test } from "bun:test"
import { shopProfileInputSchema } from "../src/schemas"

test("an IBAN with a wrong checksum is refused, a correct one is compacted", () => {
  expect(shopProfileInputSchema.safeParse({ bankIban: "TN59 1000 6035 1835 9847 8832" }).success).toBe(false)
  expect(shopProfileInputSchema.parse({ bankIban: "tn59 1000 6035 1835 9847 8831" }).bankIban).toBe(
    "TN5910006035183598478831",
  )
})

test("the euro account gets the same IBAN checksum and a 8 or 11 character BIC", () => {
  expect(shopProfileInputSchema.safeParse({ bankEurIban: "DE89 3704 0044 0532 0130 01" }).success).toBe(false)
  expect(shopProfileInputSchema.safeParse({ bankEurBic: "DEMOD" }).success).toBe(false)
  expect(
    shopProfileInputSchema.parse({ bankEurIban: "de89 3704 0044 0532 0130 00", bankEurBic: "demodeff" }),
  ).toMatchObject({
    bankEurIban: "DE89370400440532013000",
    bankEurBic: "DEMODEFF",
  })
})

test("a half filled euro account is refused, a full or an empty one passes", () => {
  const full = {
    bankEurHolder: "Atelier",
    bankEurName: "Demo Bank AG",
    bankEurIban: "DE89 3704 0044 0532 0130 00",
    bankEurBic: "DEMODEFF",
  }
  expect(shopProfileInputSchema.safeParse({ ...full, bankEurBic: null }).success).toBe(false)
  expect(shopProfileInputSchema.safeParse(full).success).toBe(true)
  expect(
    shopProfileInputSchema.safeParse({ bankEurHolder: null, bankEurName: null, bankEurIban: null, bankEurBic: null })
      .success,
  ).toBe(true)
})
