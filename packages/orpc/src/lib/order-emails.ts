import { orders } from "@workspace/db"
import { type Currency, formatMoney, PLACEHOLDER_BANK } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { deliverMail } from "./mail-log"
import { getSettings } from "./settings"
import { getShopProfile, studioInbox } from "./shop-profile"

const COPY = {
  fr: {
    subject: (n: string) => `Votre commande ${n} chez Ceraghit`,
    hello: (name: string) => `Bonjour ${name},`,
    paid: "Merci, nous avons bien reçu votre paiement.",
    cod: "Merci, votre commande est confirmée. Vous réglez en espèces à la livraison.",
    transfer: "Merci, votre commande est réservée. Elle sera expédiée dès réception de votre virement.",
    bankTitle: "Coordonnées bancaires",
    holder: "Titulaire",
    bank: "Banque",
    reference: "Référence à indiquer",
    subtotal: "Sous-total",
    shipping: "Livraison",
    total: "Total",
    link: "Suivre votre commande :",
    bye: "Ceraghit Creation",
  },
  en: {
    subject: (n: string) => `Your Ceraghit order ${n}`,
    hello: (name: string) => `Hello ${name},`,
    paid: "Thank you, we received your payment.",
    cod: "Thank you, your order is confirmed. You pay in cash on delivery.",
    transfer: "Thank you, your order is reserved. It ships as soon as we receive your transfer.",
    bankTitle: "Bank details",
    holder: "Account holder",
    bank: "Bank",
    reference: "Reference to write",
    subtotal: "Subtotal",
    shipping: "Shipping",
    total: "Total",
    link: "Follow your order:",
    bye: "Ceraghit Creation",
  },
  ar: {
    subject: (n: string) => `طلبك ${n} من سيراغيت`,
    hello: (name: string) => `مرحبا ${name}،`,
    paid: "شكرا، لقد استلمنا دفعتك.",
    cod: "شكرا، تم تأكيد طلبك. الدفع نقدا عند التسليم.",
    transfer: "شكرا، تم حجز طلبك. سيتم شحنه فور استلام التحويل.",
    bankTitle: "البيانات البنكية",
    holder: "صاحب الحساب",
    bank: "البنك",
    reference: "المرجع المطلوب كتابته",
    subtotal: "المجموع الفرعي",
    shipping: "التوصيل",
    total: "المجموع",
    link: "تابع طلبك:",
    bye: "Ceraghit Creation",
  },
} as const

/** Customer and studio each get one mail when an order is confirmed (paid online, or placed as cash on delivery or bank transfer). */
export async function sendOrderEmails(services: Services, orderId: string): Promise<void> {
  const { db, config } = services
  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } })
    if (!order) return
    const locale = (order.locale in COPY ? order.locale : "fr") as keyof typeof COPY
    const c = COPY[locale]
    const money = (minor: number, lang: string) => formatMoney(minor, order.currency as Currency, lang)
    const lines = (lang: string) =>
      order.items.map((i) => `- ${i.ref} ${i.title} x ${i.quantity}  ${money(i.unitMinor * i.quantity, lang)}`)
    const totals = (lang: string, k: typeof c) => [
      `${k.subtotal}: ${money(order.subtotalMinor, lang)}`,
      `${k.shipping}: ${money(order.shippingMinor, lang)}`,
      `${k.total}: ${money(order.totalMinor, lang)}`,
    ]
    const url = `${config.webUrl}/${locale}/order/${order.number}?t=${order.publicToken}`
    const settings = await getSettings(db)
    const profile = await getShopProfile(db)
    const studio = studioInbox(profile)
    const bank = settings.bank ?? PLACEHOLDER_BANK
    const cod = order.paymentMethod === "cod"
    const transfer = order.paymentMethod === "transfer"
    const bankLines = transfer
      ? [
          "",
          `${c.bankTitle}:`,
          `${c.holder}: ${bank.holder}`,
          `${c.bank}: ${bank.bank}`,
          `IBAN: ${bank.iban}`,
          ...(bank.bic ? [`BIC: ${bank.bic}`] : []),
          `${c.reference}: ${order.number}`,
        ]
      : []

    const toCustomer = {
      to: order.email,
      replyTo: profile.email ?? studio ?? undefined,
      subject: c.subject(order.number),
      text: [
        c.hello(order.customerName),
        "",
        cod ? c.cod : transfer ? c.transfer : c.paid,
        "",
        ...lines(locale),
        "",
        ...totals(locale, c),
        ...bankLines,
        "",
        `${c.link} ${url}`,
        "",
        c.bye,
      ].join("\n"),
    }
    const toStudio = {
      to: studio,
      replyTo: order.email,
      subject: `Nouvelle commande ${order.number}${cod ? " (paiement à la livraison)" : transfer ? " (virement à recevoir)" : ""}`,
      text: [
        `${order.customerName} <${order.email}> ${order.phone}`,
        `${order.address}, ${[order.postalCode, order.city].filter(Boolean).join(" ")}, ${order.country}`,
        order.note ? `Note: ${order.note}` : "",
        "",
        ...lines("fr"),
        "",
        ...totals("fr", COPY.fr),
        cod
          ? "Paiement en espèces à la livraison."
          : transfer
            ? "Virement bancaire à recevoir, contactez le client pour le suivi."
            : "Payée en ligne.",
      ]
        .filter((l, i, all) => l !== "" || all[i - 1] !== "")
        .join("\n"),
    }
    await deliverMail(services, "order_confirmation", toCustomer, { orderId })
    if (studio) await deliverMail(services, "order_studio", { ...toStudio, to: studio }, { orderId })
  } catch (error) {
    console.error("[order emails]", error)
  }
}

/** Tells the customer the owner confirmed their payment. Never throws. */
export async function sendPaymentReceivedEmail(services: Services, orderId: string): Promise<void> {
  const { db, config } = services
  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } })
    if (!order) return
    const locale = (order.locale in COPY ? order.locale : "fr") as keyof typeof COPY
    const c = COPY[locale]
    const money = (minor: number) => formatMoney(minor, order.currency as Currency, locale)
    const profile = await getShopProfile(db)
    await deliverMail(
      services,
      "payment_received",
      {
        to: order.email,
        replyTo: profile.email ?? studioInbox(profile) ?? undefined,
        subject: c.subject(order.number),
        text: [
          c.hello(order.customerName),
          "",
          c.paid,
          "",
          ...order.items.map((i) => `- ${i.ref} ${i.title} x ${i.quantity}  ${money(i.unitMinor * i.quantity)}`),
          "",
          `${c.subtotal}: ${money(order.subtotalMinor)}`,
          `${c.shipping}: ${money(order.shippingMinor)}`,
          `${c.total}: ${money(order.totalMinor)}`,
          "",
          `${c.link} ${config.webUrl}/${locale}/order/${order.number}?t=${order.publicToken}`,
          "",
          c.bye,
        ].join("\n"),
      },
      { orderId },
    )
  } catch (error) {
    console.error("[payment received email]", error)
  }
}
