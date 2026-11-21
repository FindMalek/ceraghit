import { describe, expect, test } from "bun:test"
import {
  bankFromProfile,
  DEFAULT_PAYONEER,
  isPayoneerUrl,
  paymentMethodsFor,
  validatePaymentSettings,
} from "../src/schemas"

const all = { online: true, cod: true, transfer: true, payoneer: false }

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

describe("payoneer", () => {
  const on = { ...all, payoneer: true }

  test("only for customers abroad paying in euros, and only when switched on", () => {
    expect(paymentMethodsFor({ country: "FR", currency: "EUR" }, on, false)).toEqual(["transfer", "payoneer"])
    expect(paymentMethodsFor({ country: "FR", currency: "EUR" }, all, false)).toEqual(["transfer"])
    expect(paymentMethodsFor({ country: "TN", currency: "EUR" }, on, false)).toEqual([])
    expect(paymentMethodsFor({ country: "FR", currency: "TND" }, on, false)).toEqual(["transfer"])
  })

  test("a link is shown only when it is an https payoneer.com address", () => {
    expect(isPayoneerUrl("https://link.payoneer.com/pay/abc")).toBe(true)
    expect(isPayoneerUrl("https://payoneer.com.evil.tld/pay")).toBe(false)
    expect(isPayoneerUrl("http://payoneer.com/pay")).toBe(false)
    expect(isPayoneerUrl("javascript:alert(1)")).toBe(false)
  })

  test("a single link for everyone needs that link", () => {
    const settings = { methods: on, payoneer: { ...DEFAULT_PAYONEER, mode: "static" as const } }
    expect(validatePaymentSettings(settings, false)).toMatch(/lien Payoneer/)
    const withLink = { ...settings, payoneer: { ...settings.payoneer, staticLink: "https://link.payoneer.com/x" } }
    expect(validatePaymentSettings(withLink, false)).toBeNull()
  })
})

describe("validatePaymentSettings", () => {
  test("refuses leaving Tunisia or abroad without any method", () => {
    expect(
      validatePaymentSettings({ methods: { online: false, cod: false, transfer: true, payoneer: false } }, true),
    ).toMatch(/Tunisie/)
    expect(
      validatePaymentSettings({ methods: { online: false, cod: true, transfer: false, payoneer: false } }, true),
    ).toMatch(/étranger/)
    expect(
      validatePaymentSettings({ methods: { online: true, cod: false, transfer: false, payoneer: false } }, false),
    ).toMatch(/Tunisie/)
    expect(
      validatePaymentSettings({ methods: { online: true, cod: false, transfer: false, payoneer: false } }, true),
    ).toBeNull()
  })
})

describe("bankFromProfile", () => {
  const profile = { bankHolder: "Atelier", bankName: "Banque", bankIban: null, bankRib: null, bankBic: null }

  test("needs holder, bank and an IBAN or a RIB", () => {
    expect(bankFromProfile(profile)).toBeNull()
    expect(bankFromProfile({ ...profile, bankRib: "10006035183598478831" })).toMatchObject({
      iban: "",
      rib: "10006035183598478831",
    })
    expect(bankFromProfile({ ...profile, bankIban: "TN59", bankHolder: " " })).toBeNull()
  })

  test("the old placeholder is not an account", () => {
    expect(bankFromProfile({ ...profile, bankIban: "À compléter" })).toBeNull()
  })
})
