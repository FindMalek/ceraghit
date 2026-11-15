import { expect, test } from "bun:test"
import { parseDemoRef } from "../../src/demo-ref"
import { CATALOGUE } from "../../src/seed/catalogue"
import { buildScenario, DEMO_DESCRIPTIONS } from "../../src/seed/scenario"

const products = [
  { id: "a", ref: "0010", title: "Curda Seca", priceTnd: 40_000, priceEur: 1_200 },
  { id: "b", ref: "0200", title: "Lampe votive", priceTnd: 100_000, priceEur: 3_000 },
]

test("the demo shop has both currencies, paid revenue and a pending order", () => {
  const { orders, items } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  expect(new Set(orders.map((o) => o.currency))).toEqual(new Set(["TND", "EUR"]))
  expect(orders.some((o) => o.status === "paid")).toBe(true)
  expect(orders.some((o) => o.paymentMethod === "cod" && o.country === "TN")).toBe(true)
  expect(orders.some((o) => o.paymentMethod === "transfer" && o.country !== "TN")).toBe(true)
  for (const order of orders) {
    const lines = items.filter((i) => i.orderId === order.id)
    expect(lines.reduce((sum, i) => sum + i.unitMinor * i.quantity, 0)).toBe(order.totalMinor)
  }
})

test("seeded online orders carry a gateway ref that matches them and none is pending", () => {
  const { orders } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  for (const order of orders.filter((o) => o.paymentMethod === "online")) {
    expect(order.status).not.toBe("pending_payment")
    expect(parseDemoRef(order.paymentRef!)).toEqual({
      outcome: order.status === "cancelled" ? "failed" : "paid",
      orderNumber: order.number!,
      amountMinor: order.totalMinor!,
      currency: order.currency as "TND" | "EUR",
    })
  }
})

test("demo orders cover fr, en and ar with a paid english transfer, at varied addresses", () => {
  const { orders } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  expect(new Set(orders.map((o) => o.locale))).toEqual(new Set(["fr", "en", "ar"]))
  expect(
    orders.some((o) => o.paymentMethod === "transfer" && o.currency === "EUR" && o.locale === "en" && o.paidAt),
  ).toBe(true)
  expect(orders.some((o) => o.locale === "ar" && o.paidAt)).toBe(true)
  expect(new Set(orders.map((o) => o.address)).size).toBeGreaterThan(10)
})

test("demo descriptions point at real products, always in french, and two are not translated", () => {
  const refs = new Set(CATALOGUE.map((p) => p.ref))
  const entries = Object.entries(DEMO_DESCRIPTIONS)
  expect(entries.length).toBeGreaterThanOrEqual(12)
  for (const [ref, text] of entries) {
    expect(refs.has(ref)).toBe(true)
    expect(text.fr.length).toBeGreaterThan(0)
  }
  expect(entries.filter(([, text]) => !text.en).map(([ref]) => ref)).toEqual(["0011", "0012"])
})

test("every paid transfer order has exactly one manual payment audit row", () => {
  const { orders, audit } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const paidTransfers = orders.filter((o) => o.paymentMethod === "transfer" && o.paidAt)
  expect(paidTransfers.length).toBeGreaterThan(0)
  for (const order of paidTransfers) {
    const rows = audit.filter((a) => a.orderId === order.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: "mark_paid_manually", method: "transfer", adminId: null })
  }
  expect(audit).toHaveLength(paidTransfers.length)
})
