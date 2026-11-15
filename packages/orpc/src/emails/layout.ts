import { type BankDetails, type Currency, formatMoney } from "@workspace/sdk"
import type { EmailCopy, Locale } from "./copy"

const LRI = "⁦"
const PDI = "⁩"
const RLM = "‏"

/** Keeps a left-to-right token (number, IBAN, url) in one piece inside Arabic text. Amounts from `formatMoney` are already isolated. */
export function ltr(text: string, locale: Locale): string {
  return locale !== "ar" || text.startsWith(LRI) ? text : `${LRI}${text}${PDI}`
}

export interface MailOrder {
  number: string
  currency: string
  subtotalMinor: number
  shippingMinor: number
  totalMinor: number
  items: { ref: string; title: string; quantity: number; unitMinor: number }[]
}

export const greeting = (c: EmailCopy, name: string): string[] => [c.common.hello(name), ""]

export function itemLines(order: MailOrder, locale: Locale): string[] {
  return order.items.map(
    (i) =>
      `- ${ltr(i.ref, locale)} ${i.title} ${ltr(`x ${i.quantity}`, locale)}  ${formatMoney(i.unitMinor * i.quantity, order.currency as Currency, locale)}`,
  )
}

export function totalLines(order: MailOrder, locale: Locale, c: EmailCopy): string[] {
  const money = (minor: number) => formatMoney(minor, order.currency as Currency, locale)
  return [
    `${c.common.subtotal}: ${money(order.subtotalMinor)}`,
    `${c.common.shipping}: ${money(order.shippingMinor)}`,
    `${c.common.total}: ${money(order.totalMinor)}`,
  ]
}

/** The transfer block: the account from the shop profile, or a contact line while it is missing. */
export function bankBlock(
  c: EmailCopy,
  bank: BankDetails | null,
  orderNumber: string,
  contactEmail: string,
  locale: Locale = "fr",
): string[] {
  const k = c.confirmation
  if (!bank) return ["", k.bankMissing(ltr(contactEmail, locale))]
  return [
    "",
    `${k.bankTitle}:`,
    `${k.holder}: ${bank.holder}`,
    `${k.bank}: ${bank.bank}`,
    ...(bank.rib ? [`RIB: ${ltr(bank.rib, locale)}`] : []),
    ...(bank.iban ? [`IBAN: ${ltr(bank.iban, locale)}`] : []),
    ...(bank.bic ? [`BIC: ${ltr(bank.bic, locale)}`] : []),
    `${k.reference}: ${ltr(orderNumber, locale)}`,
  ]
}

export function orderFooter(c: EmailCopy, links: { orderUrl: string; invoiceUrl?: string }, locale: Locale): string[] {
  return [
    "",
    `${c.common.link} ${ltr(links.orderUrl, locale)}`,
    ...(links.invoiceUrl ? [`${c.common.invoiceLink} ${ltr(links.invoiceUrl, locale)}`] : []),
    "",
    c.common.bye,
  ]
}

/** Collapses double blank lines, and for Arabic starts every line with RLM so clients lay it out right to left. */
export function join(lines: string[], locale: Locale = "fr"): string {
  return lines
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .map((l) => (locale === "ar" && l !== "" ? `${RLM}${l}` : l))
    .join("\n")
}
