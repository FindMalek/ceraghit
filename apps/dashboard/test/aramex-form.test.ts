import { expect, test } from "bun:test"
import { type AramexFormValues, aramexTouched, validateAramex } from "../lib/aramex-form"

const empty: AramexFormValues = {
  userName: "",
  accountNumber: "",
  accountEntity: "TUN",
  accountCountryCode: "TN",
  productTypes: { DOM: "ONP", EXP: "PPX" },
  shipper: { companyName: "", personName: "", phone: "", email: "", line1: "", city: "" },
  passwordSet: false,
  pinSet: false,
}

test("an empty form sends no aramex data, a half filled one gets French field errors", () => {
  expect(aramexTouched(empty)).toBe(false)
  const half = { ...empty, accountNumber: "12" }
  expect(aramexTouched(half)).toBe(true)
  const errors = validateAramex(half)
  expect(errors.accountNumber).toContain("4 à 12 chiffres")
  expect(errors.userName).toBeDefined()
  expect(errors.password).toBeDefined()
})

test("a complete form has no errors", () => {
  const full = { ...empty, userName: "a@b.co", accountNumber: "20016", passwordSet: true, pinSet: true }
  expect(validateAramex(full)).toEqual({})
})
