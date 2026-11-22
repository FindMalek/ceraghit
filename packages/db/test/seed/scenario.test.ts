import { expect, test } from "bun:test"
import { parseDemoRef } from "../../src/demo-ref"
import { UNGLAZED_VARIANT_REFS } from "../../src/seed"
import { CATALOGUE } from "../../src/seed/catalogue"
import { DEMO_MAIN_SECOND_REF, DEMO_MEDIA_BY_REF, DEMO_UNUSED_MEDIA } from "../../src/seed/media"
import {
  buildScenario,
  DEMO_DESCRIPTIONS,
  DEMO_LOCATIONS,
  DEMO_STOCK_STATES,
  DEMO_TN_CITIES,
  demoExtraProducts,
  demoRequests,
} from "../../src/seed/scenario"

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
  expect(audit.filter((a) => a.action === "mark_paid_manually" && a.method === "transfer")).toHaveLength(
    paidTransfers.length,
  )
})

test("the demo shop has payoneer orders waiting for a link, linked, confirmed and released after the hold", () => {
  const { orders, audit } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const payoneer = orders.filter((o) => o.paymentMethod === "payoneer")
  expect(payoneer.every((o) => o.currency === "EUR" && o.country !== "TN")).toBe(true)
  const pending = payoneer.filter((o) => o.status === "pending_payment")
  expect(pending.map((o) => Boolean(o.paymentRef)).sort()).toEqual([false, true])
  const linked = pending.find((o) => o.paymentRef)
  expect(audit.filter((a) => a.orderId === linked?.id)).toMatchObject([{ action: "payment_link_set" }])
  const paid = payoneer.filter((o) => o.paidAt)
  expect(paid).toHaveLength(1)
  expect(audit.filter((a) => a.orderId === paid[0]?.id)).toMatchObject([{ method: "payoneer" }])
  const released = payoneer.filter((o) => o.status === "cancelled")
  expect(audit.filter((a) => a.orderId === released[0]?.id)).toMatchObject([{ action: "hold_expired" }])
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

test("demo media describe their own product and include a tagged and an unused picture", () => {
  for (const ref of Object.keys(DEMO_MEDIA_BY_REF)) {
    const product = CATALOGUE.find((p) => p.ref === ref)
    expect(product?.images[0]).toBeDefined()
    expect(DEMO_MEDIA_BY_REF[ref]?.alt.fr.toLowerCase()).toContain(
      product!.title.toLowerCase().split(" ")[0]!.slice(0, 4),
    )
  }
  expect(Object.values(DEMO_MEDIA_BY_REF).some((m) => m.tags.length > 0)).toBe(true)
  expect(CATALOGUE.flatMap((p) => p.images)).not.toContain(DEMO_UNUSED_MEDIA.key)
})

test("demo shipments belong to fulfilled Aramex orders, domestic in Tunisia, cash on delivery in dinars only", () => {
  const { orders, shipments } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  expect(shipments.length).toBeGreaterThan(0)
  expect(new Set(shipments.map((s) => s.status))).toContain("exception")
  expect(new Set(shipments.map((s) => s.status))).toContain("delivered")
  for (const s of shipments.filter((x) => x.status !== "cancelled")) {
    expect(s.lastEvent).toEqual(s.events?.at(-1) ?? null)
    expect(s.status === "delivered").toBe(s.deliveredAt != null)
    expect(s.status === "exception").toBe(!!s.lastEvent?.problemCode)
  }
  for (const s of shipments.filter((x) => x.status !== "cancelled")) {
    const o = orders.find((x) => x.id === s.orderId)
    expect(o).toMatchObject({ status: "fulfilled", carrier: "aramex", trackingNumber: s.waybill })
    expect(s).toMatchObject({ environment: "fake", currency: o?.currency })
    expect(s.labelKey).toBeUndefined()
    expect(s.productGroup).toBe(o?.country === "TN" ? "DOM" : "EXP")
    expect(s.commercialInvoiceKey ?? null).toBeNull()
    if (s.codAmountMinor != null) expect([o?.country, o?.currency, o?.paymentMethod]).toEqual(["TN", "TND", "cod"])
  }
})

test("demo shipments include a booked pickup and a cancelled parcel whose order is back to paid", () => {
  const { orders, shipments } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const booked = shipments.filter((s) => s.pickupId)
  expect(booked.length).toBeGreaterThan(0)
  for (const s of booked) expect([s.status, !!s.pickupGuid]).toEqual(["created", true])
  const cancelled = shipments.find((s) => s.status === "cancelled")
  expect(cancelled?.errors?.[0]?.code).toBe("HOLD")
  const order = orders.find((o) => o.id === cancelled?.orderId)
  expect(order).toMatchObject({ status: "paid", country: "TN" })
  expect(order?.carrier ?? null).toBeNull()
  expect(shipments.filter((s) => s.orderId === cancelled?.orderId && s.status !== "cancelled")).toHaveLength(0)
})

test("a demo international parcel is waiting for its commercial invoice", () => {
  const { shipments } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const missing = shipments.filter((s) => s.errors?.some((e) => e.code === "INVOICE"))
  expect(missing.length).toBeGreaterThan(0)
  for (const s of missing) expect(s.productGroup).toBe("EXP")
})

test("the demo has a piece whose main photo is not the first one", () => {
  const product = CATALOGUE.find((p) => p.ref === DEMO_MAIN_SECOND_REF)
  expect(product?.images.length).toBeGreaterThan(1)
})

test("every Tunisian demo order city is in the demo city list", () => {
  const { orders } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const tunisian = orders.filter((o) => o.country === "TN")
  expect(tunisian.length).toBeGreaterThan(0)
  for (const o of tunisian) expect(DEMO_TN_CITIES).toContain(o.city)
})

test("one demo location has a bundled photo so the atelier card shows an image", () => {
  const withPhoto = DEMO_LOCATIONS.filter((l) => l.image)
  expect(withPhoto).toHaveLength(1)
  expect(withPhoto[0]?.image).toStartWith("/catalogue/")
})

test("the order list passes its 200 row page, the older orders stay out of the default 30 days", () => {
  const now = new Date("2026-10-22T12:00:00Z")
  const { orders } = buildScenario(now, products)
  expect(orders.length).toBeGreaterThan(200)
  expect(new Set(orders.map((o) => o.number)).size).toBe(orders.length)
  const older = orders.filter((o) => o.number!.startsWith("CER-11"))
  expect(older.every((o) => now.getTime() - o.createdAt!.getTime() > 60 * 864e5)).toBe(true)
  expect(older.every((o) => o.status !== "pending_payment")).toBe(true)
})

test("CER-10100 shows the gateway mismatch then the automatic cancel, CER-10101 is shipped without a parcel card", () => {
  const { orders, audit, shipments } = buildScenario(new Date("2026-10-22T12:00:00Z"), products)
  const mismatch = orders.find((o) => o.number === "CER-10100")!
  expect(audit.filter((a) => a.orderId === mismatch.id).map((a) => a.action)).toEqual([
    "gateway_mismatch",
    "hold_expired",
  ])
  const shipped = orders.find((o) => o.number === "CER-10101")!
  expect([shipped.status, shipped.carrier, Boolean(shipped.trackingNumber)]).toEqual(["fulfilled", "rapid-poste", true])
  expect(shipments.some((s) => s.orderId === shipped.id)).toBe(false)
})

test("demo requests cover every status and the extra products are drafts or archived with unique refs", () => {
  expect(new Set(demoRequests(new Date()).map((r) => r.status))).toEqual(
    new Set(["new", "contacted", "done", "declined"]),
  )
  const extra = demoExtraProducts(["c1", "c2", "c3"])
  expect(CATALOGUE.length + extra.length).toBeGreaterThan(40)
  expect(new Set([...CATALOGUE.map((p) => p.ref), ...extra.map((p) => p.ref)]).size).toBe(
    CATALOGUE.length + extra.length,
  )
  expect(extra.every((p) => p.status !== "published")).toBe(true)
  expect(new Set(extra.map((p) => p.categoryId)).size).toBe(3)
})

test("the stock states the storefront videos film are a last piece, a sold out piece without options and a sold out option", () => {
  const byRef = new Map(CATALOGUE.map((p) => [p.ref, p]))
  const { last, soldOut, soldOutOption } = DEMO_STOCK_STATES
  for (const { ref } of [last, soldOut, soldOutOption]) {
    expect(byRef.get(ref)?.unique).toBe(false)
    expect(byRef.get(ref)?.quoteOnly).toBe(false)
  }
  expect([last.stock, soldOut.stock, soldOutOption.stock]).toEqual([1, 0, 0])
  expect(UNGLAZED_VARIANT_REFS.has(soldOutOption.ref)).toBe(true)
  expect(UNGLAZED_VARIANT_REFS.has(soldOut.ref)).toBe(false)
  expect(UNGLAZED_VARIANT_REFS.has(last.ref)).toBe(false)
})
