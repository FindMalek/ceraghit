import type { orderItems, orders } from "../schema"

type NewOrder = typeof orders.$inferInsert
type NewItem = typeof orderItems.$inferInsert

export interface ScenarioProduct {
  id: string
  ref: string
  title: string
  priceTnd: number
  priceEur: number
}

const PEOPLE = [
  "Amel Trabelsi",
  "Karim Ben Salah",
  "Sonia Gharbi",
  "Youssef Mejri",
  "Lina Dupont",
  "Marc Peeters",
  "Inès Haddad",
  "Julien Martin",
]
const TN_CITIES = ["Tunis", "La Marsa", "Sousse", "Sfax", "Hammamet", "Nabeul"]
const ABROAD = [
  { country: "BE", city: "Bruxelles" },
  { country: "FR", city: "Lyon" },
  { country: "DE", city: "Berlin" },
]

/** Small deterministic generator, so the demo (and its test) always produce the same shop history. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** About 45 orders over the last 60 days, ~70% in TND from Tunisia and ~30% in EUR from abroad. */
export function buildScenario(now: Date, products: ScenarioProduct[]): { orders: NewOrder[]; items: NewItem[] } {
  const rand = rng(2027)
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!
  const out: { orders: NewOrder[]; items: NewItem[] } = { orders: [], items: [] }

  for (let n = 0; n < 45; n++) {
    const id = crypto.randomUUID()
    const abroad = rand() < 0.3
    const place = abroad ? pick(ABROAD) : { country: "TN", city: pick(TN_CITIES) }
    const currency = abroad ? "EUR" : "TND"
    const createdAt = new Date(now.getTime() - rand() * 60 * 864e5)
    const roll = rand()
    const status =
      createdAt > new Date(now.getTime() - 3600e3)
        ? "pending_payment"
        : roll < 0.1
          ? "cancelled"
          : roll < 0.4
            ? "fulfilled"
            : "paid"
    const cod = !abroad && n % 4 === 0
    const name = pick(PEOPLE)
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(products))
    const unique = [...new Map(lines.map((p) => [p.id, p])).values()]
    const unit = (p: ScenarioProduct) => (currency === "TND" ? p.priceTnd : p.priceEur)
    const subtotal = unique.reduce((sum, p) => sum + unit(p), 0)
    out.orders.push({
      id,
      number: `CER-${10_000 + n}`,
      publicToken: `demo-${n}`,
      status,
      currency,
      subtotalMinor: subtotal,
      shippingMinor: 0,
      totalMinor: subtotal,
      customerName: name,
      email: `${name.split(" ")[0]!.toLowerCase()}.${n}@example.com`,
      phone: abroad ? "+32 470 00 00 00" : "+216 20 000 000",
      country: place.country,
      city: place.city,
      address: "12 rue des Potiers",
      locale: abroad ? "fr" : "fr",
      paymentMethod: cod ? "cod" : "online",
      paymentProvider: cod ? "cod" : "demo",
      paymentRef: cod ? null : `demo_seed_${n}`,
      paidAt: status === "paid" || status === "fulfilled" ? new Date(createdAt.getTime() + 5 * 60_000) : null,
      createdAt,
    })
    for (const p of unique) {
      out.items.push({ orderId: id, productId: p.id, ref: p.ref, title: p.title, unitMinor: unit(p), quantity: 1 })
    }
  }
  return out
}
