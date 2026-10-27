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
    subtotal: "المجموع الفرعي",
    shipping: "التوصيل",
    total: "المجموع",
    link: "تابع طلبك:",
    bye: "Ceraghit Creation",
  },
} as const

/** Customer and studio each get one mail when an order is confirmed (paid online, or placed as cash on delivery). */
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
    const studio = (await getSettings(db)).contactEmail
    const cod = order.paymentMethod === "cod"

    const toCustomer = {
      to: order.email,
      replyTo: studio,
      subject: c.subject(order.number),
      text: [
        c.hello(order.customerName),
        "",
        cod ? c.cod : c.paid,
        "",
        ...lines(locale),
        "",
        ...totals(locale, c),
        "",
        `${c.link} ${url}`,
        "",
        c.bye,
      ].join("\n"),
    }
    const toStudio = {
      to: studio,
      replyTo: order.email,
      subject: `Nouvelle commande ${order.number}${cod ? " (paiement à la livraison)" : ""}`,
      text: [
        `${order.customerName} <${order.email}> ${order.phone}`,
        `${order.address}, ${[order.postalCode, order.city].filter(Boolean).join(" ")}, ${order.country}`,
        order.note ? `Note: ${order.note}` : "",
        "",
        ...lines("fr"),
        "",
        ...totals("fr", COPY.fr),
        cod ? "Paiement en espèces à la livraison." : "Payée en ligne.",
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
