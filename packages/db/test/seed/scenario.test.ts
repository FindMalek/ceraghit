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
    expect(parseDemoRef(order.paymentRef!)).toMatchObject({
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
  expect(audit.filter((a) => a.action === "mark_paid_manually")).toHaveLength(paidTransfers.length)
})

test("the demo shows one late payment on a cancelled online order", () => {
  const { orders, audit } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const rows = audit.filter((a) => a.action === "late_payment")
  expect(rows).toHaveLength(1)
  expect(orders.find((o) => o.id === rows[0]!.orderId)).toMatchObject({ paymentMethod: "online", status: "cancelled" })
})

test("the demo has one sent and one failed mail on real orders, so the failures page is never empty", () => {
  const { orders, mail } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  expect(mail.map((m) => m.status).sort()).toEqual(["failed", "sent"])
  const failed = mail.find((m) => m.status === "failed")!
  expect(failed.error).toBe("resend 503: service unavailable")
  expect(orders.find((o) => o.id === failed.orderId)?.email).toBe(failed.to)
})

test("demo job runs cover stale, failed, interrupted, healthy and never run", () => {
  const now = new Date("2026-10-22T12:00:00Z")
  const { jobRuns } = buildScenario(now, products)
  const latest = (name: string) =>
    jobRuns.filter((r) => r.name === name).sort((a, b) => b.startedAt!.getTime() - a.startedAt!.getTime())[0]
  const hours = (name: string) => (now.getTime() - latest(name)!.startedAt!.getTime()) / 3_600_000
  expect(latest("cleanup-uploads")).toMatchObject({ ok: true })
  expect(hours("cleanup-uploads")).toBeGreaterThan(26)
  expect(latest("release-holds")).toMatchObject({ ok: false, error: "Délai dépassé" })
  expect(jobRuns.filter((r) => r.name === "release-holds").some((r) => r.ok)).toBe(true)
  expect(latest("track-shipments")).toMatchObject({ ok: null, finishedAt: null })
  expect(latest("retry-mail")).toMatchObject({ ok: true })
  expect(latest("ai-usage-rollover")).toBeUndefined()
})

test("only fulfilled orders carry shipping, shipped after payment", () => {
  const { orders } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const fulfilled = orders.filter((o) => o.status === "fulfilled")
  expect(fulfilled.length).toBeGreaterThan(0)
  for (const o of fulfilled) {
    expect(o.carrier).toBeTruthy()
    expect(o.shippedAt!.getTime()).toBeGreaterThanOrEqual(o.paidAt!.getTime())
  }
  expect(fulfilled.some((o) => o.carrier === "aramex" && o.trackingUrl?.startsWith("https://"))).toBe(true)
  for (const o of orders.filter((o) => o.status !== "fulfilled")) {
    expect([o.carrier, o.carrierName, o.trackingNumber, o.trackingUrl, o.shippedAt].every((v) => v == null)).toBe(true)
  }
})

test("unpaid offline orders are younger than the default 7 day window, one is about to expire", () => {
  const now = new Date("2026-10-22T12:00:00Z")
  const pending = buildScenario(now, products).orders.filter(
    (o) => o.status === "pending_payment" && o.paymentMethod !== "online",
  )
  const ages = pending.map((o) => (now.getTime() - o.createdAt!.getTime()) / 864e5)
  expect(ages.every((age) => age < 7)).toBe(true)
  expect(ages.some((age) => age >= 5)).toBe(true)
})
