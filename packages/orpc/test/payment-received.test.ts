import { expect, test } from "bun:test"
import { type ConfirmationOrder, renderPaymentReceived } from "../src/emails/confirmation"

const ctx = { webUrl: "https://web.test", bank: null, contactEmail: "contact@studio.test", studio: null }
const order = (locale: string): ConfirmationOrder => ({
  number: "CG-1001",
  currency: "EUR",
  subtotalMinor: 2400,
  shippingMinor: 900,
  totalMinor: 3300,
  items: [{ ref: "V-10", title: "Vase", quantity: 2, unitMinor: 1200 }],
  locale,
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
})

test.each(["fr", "en", "ar"])("payment received mail in %s links the order and its invoice", (locale) => {
  const { text, to } = renderPaymentReceived(order(locale), ctx)
  expect(to).toBe("buyer@example.com")
  expect(text).toContain(`https://web.test/${locale}/order/CG-1001?t=tok`)
  expect(text).toContain(`https://web.test/${locale}/order/CG-1001/invoice?t=tok`)
})
