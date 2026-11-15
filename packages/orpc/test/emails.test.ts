import { expect, test } from "bun:test"
import { type ConfirmationOrder, renderOrderConfirmation, renderStudioNewOrder } from "../src/emails/confirmation"

const bank = {
  holder: "Atelier Test",
  bank: "Banque Test",
  iban: "TN5910006035183598478831",
  rib: "10006035183598478831",
  bic: "BSTUTNTT",
}
const ctx = { webUrl: "https://web.test", bank, contactEmail: "contact@studio.test", studio: "notify@studio.test" }
const order = (patch: Partial<ConfirmationOrder> = {}): ConfirmationOrder => ({
  number: "CG-1001",
  currency: "EUR",
  subtotalMinor: 2400,
  shippingMinor: 900,
  totalMinor: 3300,
  items: [{ ref: "V-10", title: "Vase", quantity: 2, unitMinor: 1200 }],
  locale: "fr",
  publicToken: "tok",
  email: "buyer@example.com",
  customerName: "Test Buyer",
  phone: "+32470000000",
  address: "1 rue du test",
  postalCode: null,
  city: "Bruxelles",
  country: "BE",
  note: null,
  paymentMethod: "transfer",
  ...patch,
})

test("transfer confirmation shows the profile bank block", () => {
  const { text } = renderOrderConfirmation(order(), ctx)
  expect(text).toContain("IBAN: TN5910006035183598478831")
  expect(text).toContain("RIB: 10006035183598478831")
  expect(text).toContain("Référence à indiquer: CG-1001")
  expect(text).toContain("https://web.test/fr/order/CG-1001?t=tok")
})

test("missing bank gives a contact line, never an empty IBAN", () => {
  const { text } = renderOrderConfirmation(order(), { ...ctx, bank: null })
  expect(text).not.toContain("IBAN")
  expect(text).toContain("contact@studio.test")
})

test("arabic isolates ltr tokens and starts lines with RLM", () => {
  const { text } = renderOrderConfirmation(order({ locale: "ar" }), ctx)
  expect(text).toContain("IBAN: ⁦TN5910006035183598478831⁩")
  expect(text).toContain("⁦https://web.test/ar/order/CG-1001?t=tok⁩")
  expect(text).not.toContain("⁦⁦")
  const lines = text.split("\n").filter((l) => l !== "")
  expect(lines.every((l) => l.startsWith("‏"))).toBe(true)
})

test("studio mail is French and goes to the given inbox", () => {
  const mail = renderStudioNewOrder(order(), "notify@studio.test")
  expect(mail.to).toBe("notify@studio.test")
  expect(mail.subject).toBe("Nouvelle commande CG-1001 (virement à recevoir)")
})
