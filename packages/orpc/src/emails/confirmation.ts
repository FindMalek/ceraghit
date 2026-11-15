import type { BankDetails } from "@workspace/sdk"
import type { Mail } from "../lib/mailer"
import { asLocale, EMAIL_COPY } from "./copy"
import { bankBlock, greeting, itemLines, join, type MailOrder, orderFooter, totalLines } from "./layout"
import { orderUrl } from "./order-url"

export interface ConfirmationOrder extends MailOrder {
  locale: string
  publicToken: string
  email: string
  customerName: string
  phone: string
  address: string
  postalCode: string | null
  city: string | null
  country: string
  note: string | null
  paymentMethod: string | null
}

export interface MailContext {
  webUrl: string
  bank: BankDetails | null
  /** Shown to the customer while the bank details are missing, and used for replies. */
  contactEmail: string
  studio: string | null
}

export function renderOrderConfirmation(order: ConfirmationOrder, ctx: MailContext): Mail {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  const k = c.confirmation
  const transfer = order.paymentMethod === "transfer"
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: k.subject(order.number),
    text: join(
      [
        ...greeting(c, order.customerName),
        order.paymentMethod === "cod" ? k.cod : transfer ? k.transfer : k.paid,
        "",
        ...itemLines(order, locale),
        "",
        ...totalLines(order, locale, c),
        ...(transfer ? bankBlock(c, ctx.bank, order.number, ctx.contactEmail, locale) : []),
        ...orderFooter(c, { orderUrl: orderUrl(ctx.webUrl, order) }, locale),
      ],
      locale,
    ),
  }
}

/** Studio mails stay in French. */
export function renderStudioNewOrder(order: ConfirmationOrder, studio: string): Mail {
  const c = EMAIL_COPY.fr
  const cod = order.paymentMethod === "cod"
  const transfer = order.paymentMethod === "transfer"
  return {
    to: studio,
    replyTo: order.email,
    subject: `Nouvelle commande ${order.number}${cod ? " (paiement à la livraison)" : transfer ? " (virement à recevoir)" : ""}`,
    text: join([
      `${order.customerName} <${order.email}> ${order.phone}`,
      `${order.address}, ${[order.postalCode, order.city].filter(Boolean).join(" ")}, ${order.country}`,
      order.note ? `Note: ${order.note}` : "",
      "",
      ...itemLines(order, "fr"),
      "",
      ...totalLines(order, "fr", c),
      cod
        ? "Paiement en espèces à la livraison."
        : transfer
          ? "Virement bancaire à recevoir, contactez le client pour le suivi."
          : "Payée en ligne.",
    ]),
  }
}

/** Sent when the owner confirms the payment. */
export function renderPaymentReceived(order: ConfirmationOrder, ctx: MailContext): Mail {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: c.confirmation.subject(order.number),
    text: join(
      [
        ...greeting(c, order.customerName),
        c.confirmation.paid,
        "",
        ...itemLines(order, locale),
        "",
        ...totalLines(order, locale, c),
        ...orderFooter(c, { orderUrl: orderUrl(ctx.webUrl, order) }, locale),
      ],
      locale,
    ),
  }
}
