import type { CarrierId } from "@workspace/sdk"
import { type BankDetails, type Currency, carrierDisplayName, formatMoney } from "@workspace/sdk"
import { invoiceUrl } from "../lib/invoices"
import type { Mail } from "../lib/mailer"
import { asLocale, EMAIL_COPY } from "./copy"
import {
  bankBlock,
  confirmationIntro,
  greeting,
  itemLines,
  join,
  ltr,
  type MailOrder,
  orderFooter,
  totalLines,
} from "./layout"
import { orderUrl } from "./order-url"

// react-email (react-dom, prettier) is most of a cold start's work and only mails need it: load it when one is built.
const templates = () => import("./templates")

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
  /** The one link of a shop that uses a single Payoneer link for everyone. */
  payoneerLink?: string | null
}

export async function renderOrderConfirmation(order: ConfirmationOrder, ctx: MailContext): Promise<Mail> {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  const k = c.confirmation
  const transfer = order.paymentMethod === "transfer"
  const payoneer = order.paymentMethod === "payoneer"
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: k.subject(order.number),
    html: await (await templates()).confirmationHtml(order, ctx),
    text: join(
      [
        ...greeting(c, order.customerName),
        confirmationIntro(order.paymentMethod, ctx, k),
        "",
        ...itemLines(order, locale),
        "",
        ...totalLines(order, locale, c),
        ...(transfer ? bankBlock(c, ctx.bank, order.number, ctx.contactEmail, locale) : []),
        ...(payoneer && ctx.payoneerLink
          ? ["", ltr(ctx.payoneerLink, locale), `${k.reference}: ${ltr(order.number, locale)}`]
          : []),
        ...orderFooter(c, { orderUrl: orderUrl(ctx.webUrl, order) }, locale),
      ],
      locale,
    ),
  }
}

/** Studio mails stay in French. */
export async function renderStudioNewOrder(order: ConfirmationOrder, ctx: MailContext, studio: string): Promise<Mail> {
  const c = EMAIL_COPY.fr
  const cod = order.paymentMethod === "cod"
  const transfer = order.paymentMethod === "transfer"
  const payoneer = order.paymentMethod === "payoneer"
  const subject = `Nouvelle commande ${order.number}${cod ? " (paiement à la livraison)" : transfer ? " (virement à recevoir)" : payoneer ? " (Payoneer à recevoir)" : ""}`
  const status = cod
    ? "Paiement en espèces à la livraison."
    : transfer
      ? "Virement bancaire à recevoir, contactez le client pour le suivi."
      : payoneer
        ? "Paiement Payoneer : envoyez le lien par email au client."
        : "Payée en ligne."
  return {
    to: studio,
    replyTo: order.email,
    subject,
    html: await (await templates()).studioOrderHtml(
      order,
      { ...ctx, contactEmail: ctx.contactEmail || studio },
      subject,
      status,
    ),
    text: join([
      `${order.customerName} <${order.email}> ${order.phone}`,
      `${order.address}, ${[order.postalCode, order.city].filter(Boolean).join(" ")}, ${order.country}`,
      order.note ? `Note: ${order.note}` : "",
      "",
      ...itemLines(order, "fr"),
      "",
      ...totalLines(order, "fr", c),
      status,
    ]),
  }
}

/** Sent when the owner confirms the payment. */
export async function renderPaymentReceived(order: ConfirmationOrder, ctx: MailContext): Promise<Mail> {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: c.paymentReceived.subject(order.number),
    html: await (await templates()).paymentReceivedHtml(order, ctx),
    text: join(
      [
        ...greeting(c, order.customerName),
        c.confirmation.paid,
        "",
        ...itemLines(order, locale),
        "",
        ...totalLines(order, locale, c),
        ...orderFooter(c, { orderUrl: orderUrl(ctx.webUrl, order), invoiceUrl: invoiceUrl(ctx.webUrl, order) }, locale),
      ],
      locale,
    ),
  }
}

/** Sent when the owner sets the Payoneer link of a pending order. */
export async function renderPaymentLink(order: ConfirmationOrder, ctx: MailContext, link: string): Promise<Mail> {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: c.paymentLink.subject(order.number),
    html: await (await templates()).paymentLinkHtml(order, ctx, link),
    text: join(
      [
        ...greeting(c, order.customerName),
        c.paymentLink.intro,
        "",
        ltr(link, locale),
        `${c.confirmation.reference}: ${ltr(order.number, locale)}`,
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

/** Sent when an unpaid order is released after its payment window. */
export async function renderOrderExpired(order: ConfirmationOrder, ctx: MailContext, days: number): Promise<Mail> {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: c.expired.subject(order.number),
    html: await (await templates()).orderExpiredHtml(order, ctx, days),
    text: join(
      [
        ...greeting(c, order.customerName),
        c.expired.body(days),
        c.expired.again,
        "",
        ...itemLines(order, locale),
        ...(ctx.contactEmail ? ["", ctx.contactEmail] : []),
      ],
      locale,
    ),
  }
}

export interface MailShipment {
  carrier: CarrierId
  carrierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
}

/** Sent once when the order ships. The carrier is printed as typed, the tracking number and link stay left to right. */
export async function renderShipped(order: ConfirmationOrder, shipment: MailShipment, ctx: MailContext): Promise<Mail> {
  const locale = asLocale(order.locale)
  const c = EMAIL_COPY[locale]
  const k = c.shipped
  const cod =
    order.paymentMethod === "cod" ? k.cod(formatMoney(order.totalMinor, order.currency as Currency, locale)) : null
  return {
    to: order.email,
    replyTo: ctx.contactEmail || undefined,
    subject: k.subject(order.number),
    html: await (await templates()).shippedHtml(order, shipment, ctx),
    text: join(
      [
        ...greeting(c, order.customerName),
        k.intro,
        "",
        `${k.carrier}: ${carrierDisplayName(shipment)}`,
        ...(shipment.trackingNumber ? [`${k.trackingNumber}: ${ltr(shipment.trackingNumber, locale)}`] : []),
        ...(shipment.trackingUrl ? [`${k.track} ${ltr(shipment.trackingUrl, locale)}`] : []),
        ...(shipment.trackingNumber || shipment.trackingUrl ? [] : [k.noTracking]),
        ...(cod ? ["", cod] : []),
        "",
        ...itemLines(order, locale),
        ...orderFooter(c, { orderUrl: orderUrl(ctx.webUrl, order) }, locale),
      ],
      locale,
    ),
  }
}
