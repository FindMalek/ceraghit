import { describe, expect, test } from "bun:test"
import { paymentMethodsFor, validatePaymentSettings } from "../src/schemas"

const all = { online: true, cod: true, transfer: true }

describe("paymentMethodsFor", () => {
  test("Tunisia in dinars gets card then cash on delivery", () => {
    expect(paymentMethodsFor({ country: "TN", currency: "TND" }, all, true)).toEqual(["online", "cod"])
  })

  test("abroad in euros gets card then transfer", () => {
    expect(paymentMethodsFor({ country: "FR", currency: "EUR" }, all, true)).toEqual(["online", "transfer"])
  })

  test("Tunisia in euros never gets cash on delivery", () => {
    expect(paymentMethodsFor({ country: "TN", currency: "EUR" }, all, true)).toEqual(["online"])
  })

  test("card is hidden while the gateway is not ready, whatever the switch says", () => {
    expect(paymentMethodsFor({ country: "FR", currency: "EUR" }, all, false)).toEqual(["transfer"])
  })
})

describe("validatePaymentSettings", () => {
  test("refuses leaving Tunisia or abroad without any method", () => {
    expect(validatePaymentSettings({ methods: { online: false, cod: false, transfer: true } }, true)).toMatch(/Tunisie/)
    expect(validatePaymentSettings({ methods: { online: false, cod: true, transfer: false } }, true)).toMatch(
      /étranger/,
    )
    expect(validatePaymentSettings({ methods: { online: true, cod: false, transfer: false } }, false)).toMatch(
      /Tunisie/,
    )
    expect(validatePaymentSettings({ methods: { online: true, cod: false, transfer: false } }, true)).toBeNull()
  })
})
