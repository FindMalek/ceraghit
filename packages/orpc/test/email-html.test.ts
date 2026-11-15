import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { lengthParity, PARITY_BANDS } from "@workspace/sdk"
import { mailColors } from "../src/emails/brand"
import {
  type ConfirmationOrder,
  renderOrderConfirmation,
  renderPaymentReceived,
  renderStudioNewOrder,
} from "../src/emails/confirmation"
import { renderStudioRequest } from "../src/emails/request"

const css = readFileSync(new URL("../../ui/src/styles/brand.css", import.meta.url), "utf8")
const cssValue = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]

const ctx = {
  webUrl: "https://shop.test",
  bank: { holder: "Atelier", bank: "Banque", iban: "TN5910006035183598478831", rib: "", bic: "" },
  contactEmail: "contact@studio.test",
  studio: "notify@studio.test",
}
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

test("mail colours match brand.css", () => {
  const names = {
    ink: "brand-ink",
    inkRaised: "brand-ink-raised",
    inkSoft: "brand-ink-soft",
    gold: "brand-gold",
    goldBright: "brand-gold-bright",
    goldTitle: "brand-gold-title",
  } as const
  for (const [key, name] of Object.entries(names)) {
    expect(String(mailColors[key as keyof typeof names]), name).toBe(cssValue(name) ?? "missing")
  }
})

test("templates hold no raw colours", () => {
  for (const file of ["templates.tsx", "layout.ts", "confirmation.ts", "request.ts"]) {
    const source = readFileSync(new URL(`../src/emails/${file}`, import.meta.url), "utf8")
    expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  }
})

test.each(["fr", "en", "ar"])("customer mails in %s have branded html and a complete text", async (locale) => {
  const mail = await renderOrderConfirmation(order(locale), ctx)
  const html = mail.html ?? ""
  const allowed = new Set(Object.values(mailColors))
  for (const hex of html.match(/#[0-9a-f]{3,8}\b/gi) ?? [])
    expect(allowed.has(hex.toLowerCase() as never), hex).toBe(true)
  expect(html).toContain('src="https://shop.test/logo.webp"')
  expect(html).toContain('alt="Ceraghit Creation"')
  expect(html).toContain('name="color-scheme"')
  expect(html).toContain(`lang="${locale}"`)
  expect(html).toContain(locale === "ar" ? 'dir="rtl"' : 'dir="ltr"')
  expect(html).toContain("TN5910006035183598478831")
  expect(html).toContain(`https://shop.test/${locale}/order/CG-1001?t=tok`)
  expect(html).not.toMatch(/<img[^>]+(width="1"|height="1")/)
  expect(mail.text).toContain("TN5910006035183598478831")
  expect(mail.text).toContain("CG-1001")
})

test("html copy stays inside the parity bands", async () => {
  const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  const fr = strip((await renderOrderConfirmation(order("fr"), ctx)).html ?? "")
  for (const lang of ["en", "ar"] as const) {
    const other = strip((await renderOrderConfirmation(order(lang), ctx)).html ?? "")
    expect(lengthParity(fr, other, PARITY_BANDS[lang]).ok, lang).toBe(true)
  }
})

test("payment received, studio order and request mails render html", async () => {
  expect((await renderPaymentReceived(order("en"), ctx)).html).not.toContain("IBAN")
  const studio = await renderStudioNewOrder(order("fr"), ctx, "notify@studio.test")
  expect(studio.html).toContain("Nouvelle commande CG-1001")
  const request = await renderStudioRequest(
    { name: "Léa", email: "lea@example.com", description: "Un grand vase <b>bleu</b>", images: [] },
    "notify@studio.test",
    "https://shop.test",
  )
  expect(request.html).toContain("Un grand vase &lt;b&gt;bleu&lt;/b&gt;")
  expect(request.text).toContain("Un grand vase <b>bleu</b>")
})
