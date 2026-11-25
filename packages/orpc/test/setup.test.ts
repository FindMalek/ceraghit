import { describe, expect, test } from "bun:test"
import { computeSetup, type SetupInput } from "../src/lib/setup"
import type { ShopProfileRow } from "../src/lib/shop-profile"

const emptyProfile: ShopProfileRow = {
  id: "shop",
  legalName: null,
  displayName: null,
  legalForm: null,
  taxId: null,
  registryNumber: null,
  address: null,
  postalCode: null,
  city: null,
  country: "TN",
  phones: [],
  email: null,
  notifyEmail: null,
  bankHolder: null,
  bankName: null,
  bankRib: null,
  bankIban: null,
  bankBic: null,
  bankEurHolder: null,
  bankEurName: null,
  bankEurIban: null,
  bankEurBic: null,
  bankEurAddress: null,
  bankUsdHolder: null,
  bankUsdName: null,
  bankUsdAccount: null,
  bankUsdRouting: null,
  bankUsdSwift: null,
  bankUsdAccountType: null,
  bankUsdAddress: null,
  invoiceNote: null,
  shippingConfirmedAt: null,
  skippedSteps: [],
  onboardedAt: null,
  updatedAt: new Date(),
}
const noIntegrations = { konnect: false, aramex: false, payoneer: false, groq: false, emailDomain: false }
const input = (profile: Partial<ShopProfileRow> = {}, owner?: SetupInput["owner"]): SetupInput => ({
  owner: owner ?? { name: "Sabri Ghit", nameConfirmedAt: null },
  profile: { ...emptyProfile, ...profile },
  integrations: noIntegrations,
})
const step = (status: ReturnType<typeof computeSetup>, id: string) => status.steps.find((s) => s.id === id)!

const bank = { bankHolder: "Atelier", bankName: "Banque Test" }
const filledProfile: Partial<ShopProfileRow> = {
  legalName: "Ceraghit SARL",
  displayName: "Ceraghit",
  address: "1 rue du test",
  city: "Tunis",
  phones: ["+216 20 000 000"],
  email: "atelier@example.com",
  notifyEmail: "atelier@example.com",
  taxId: "1234567A",
  ...bank,
  bankIban: "TN5910006035183598478831",
  shippingConfirmedAt: new Date(),
}
const confirmedOwner = { name: "Sabri Ghit", nameConfirmedAt: new Date() }

describe("computeSetup", () => {
  test("an empty profile has every required step open and 9 things remaining", () => {
    const status = computeSetup(input())
    expect(status.steps.filter((s) => s.required && !s.done)).toHaveLength(4)
    expect(status).toMatchObject({ remaining: 9, total: 9, done: 0, requiredDone: false, onboarded: false })
    expect(step(status, "profile").missing).toContain("taxId")
  })

  test("a placeholder bank is not done, an IBAN-only or RIB-only account is", () => {
    const placeholder = { bankHolder: "Ceraghit Creation", bankName: "À compléter", bankIban: "À compléter" }
    expect(step(computeSetup(input(placeholder)), "bank").done).toBe(false)
    expect(step(computeSetup(input({ ...bank, bankIban: "TN5910006035183598478831" })), "bank").done).toBe(true)
    expect(step(computeSetup(input({ ...bank, bankRib: "10006035183598478831" })), "bank").done).toBe(true)
  })

  test("placeholder text does not fill a profile field", () => {
    const status = computeSetup(input({ ...filledProfile, address: "[à renseigner]", city: "A completer" }))
    expect(step(status, "profile")).toMatchObject({ done: false, missing: ["address", "city"] })
  })

  test("a skipped optional step leaves the badge number", () => {
    const status = computeSetup(input({ skippedSteps: ["groq"] }))
    expect(step(status, "groq").skipped).toBe(true)
    expect(status.remaining).toBe(8)
  })

  test("every required step done with no optional ones is requiredDone", () => {
    const status = computeSetup(input(filledProfile, confirmedOwner))
    expect(status.requiredDone).toBe(true)
    expect(status.remaining).toBe(5)
  })

  test("the owner step needs the name confirmed, not just present", () => {
    expect(step(computeSetup(input(filledProfile)), "owner")).toMatchObject({ done: false, missing: ["name"] })
  })
})
