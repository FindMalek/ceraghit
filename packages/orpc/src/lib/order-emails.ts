import { orders } from "@workspace/db"
import { type Currency, formatMoney } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import type { Services } from "../context"
import { getSettings } from "./settings"

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
  const { db, mailer, config } = services
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
    const studio = settings.contactEmail
    const cod = order.paymentMethod === "cod"
    const transfer = order.paymentMethod === "transfer"
    const bankLines = transfer
      ? [
          "",
          `${c.bankTitle}:`,
          `${c.holder}: ${settings.bank.holder}`,
          `${c.bank}: ${settings.bank.bank}`,
          `IBAN: ${settings.bank.iban}`,
          ...(settings.bank.bic ? [`BIC: ${settings.bank.bic}`] : []),
          `${c.reference}: ${order.number}`,
        ]
      : []

    const toCustomer = {
      to: order.email,
      replyTo: studio,
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
    const results = await Promise.allSettled([mailer.send(toCustomer), mailer.send(toStudio)])
    for (const r of results) if (r.status === "rejected") console.error(`[mail ${order.number}]`, r.reason)
  } catch (error) {
    console.error("[order emails]", error)
  }
}
