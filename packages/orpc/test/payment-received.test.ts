import { expect, test } from "bun:test"
import { type ConfirmationOrder, renderPaymentReceived } from "../src/emails/confirmation"
import { EMAIL_COPY } from "../src/emails/copy"

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

test.each(["fr", "en", "ar"] as const)(
  "payment received mail in %s links the order and its invoice",
  async (locale) => {
    const { text, html, to, subject } = await renderPaymentReceived(order(locale), ctx)
    expect(to).toBe("buyer@example.com")
    expect(subject).toBe(EMAIL_COPY[locale].paymentReceived.subject("CG-1001"))
    expect(subject).not.toBe(EMAIL_COPY[locale].confirmation.subject("CG-1001"))
    expect(text).toContain(EMAIL_COPY[locale].common.invoiceLink)
    expect(text).toContain(`https://web.test/${locale}/order/CG-1001?t=tok`)
    expect(text).toContain(`https://web.test/${locale}/order/CG-1001/invoice?t=tok`)
    expect(html).toContain(`href="https://web.test/${locale}/order/CG-1001/invoice?t=tok"`)
    expect(html).toContain(EMAIL_COPY[locale].common.invoiceLink)
  },
)
