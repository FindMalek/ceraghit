import { expect, test } from "bun:test"
import { buildScenario } from "./scenario"

const products = [
  { id: "a", ref: "0010", title: "Curda Seca", priceTnd: 40_000, priceEur: 1_200 },
  { id: "b", ref: "0200", title: "Lampe votive", priceTnd: 100_000, priceEur: 3_000 },
]

test("the demo shop has both currencies, paid revenue and a pending order", () => {
  const { orders, items } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  expect(new Set(orders.map((o) => o.currency))).toEqual(new Set(["TND", "EUR"]))
  expect(orders.some((o) => o.status === "paid")).toBe(true)
  expect(orders.some((o) => o.paymentMethod === "cod" && o.country === "TN")).toBe(true)
  for (const order of orders) {
    const lines = items.filter((i) => i.orderId === order.id)
    expect(lines.reduce((sum, i) => sum + i.unitMinor * i.quantity, 0)).toBe(order.totalMinor)
  }
})
