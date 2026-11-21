import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  admins,
  categories,
  createDb,
  demoRef,
  invoiceCounters,
  invoices,
  mailLog,
  newDemoNonce,
  orderAudit,
  orderItems,
  orders,
  products,
} from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { clearIntegration, saveIntegration } from "../src/lib/integrations"
import type { Mail } from "../src/lib/mailer"
import { releaseExpiredHolds, settleOrder } from "../src/lib/orders"
import type { PaymentCheck, PaymentProvider } from "../src/lib/payments"
import { DemoProvider } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { getPaymentResponse } from "./fixtures/konnect"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("settleOrder against the gateway answer", () => {
  const db = createDb(url!)
  const sent: Mail[] = []
  let answer: PaymentCheck = { status: "pending", amountMinor: 0, currency: null, orderNumber: null }
  let checks = 0
  const payments: PaymentProvider = {
    name: "konnect",
    mode: "test",
    init: async () => ({ payUrl: "x", ref: "x" }),
    check: async () => {
      checks++
      return answer
    },
  }
  const services = {
    db,
    payments,
    mailer: { send: async (mail: Mail) => void sent.push(mail) },
    storage: null,
    now: () => new Date("2096-03-10T10:00:00Z"),
    config: { webUrl: "https://web.test", apiPublicUrl: "https://api.test", appEnv: "local", deployEnv: "test" },
  } as unknown as Services

  let seq = 0
  let productId = ""

  const konnectAnswer = (
    over: Parameters<typeof getPaymentResponse>[0],
    status: PaymentCheck["status"],
  ): PaymentCheck => {
    const { payment } = getPaymentResponse(over)
    return {
      status,
      amountMinor: payment.amount,
      currency: payment.token as "EUR",
      orderNumber: payment.orderId,
    }
  }

  const order = async (over: Partial<typeof orders.$inferInsert> = {}) => {
    const n = `TST-ST-${Date.now()}-${seq++}`
    const [row] = await db
      .insert(orders)
      .values({
        number: n,
        publicToken: "t",
        status: "pending_payment",
        paymentMethod: "online",
        paymentProvider: "konnect",
        paymentRef: `ref-${n}`,
        currency: "EUR",
        subtotalMinor: 3_400,
        totalMinor: 3_400,
        customerName: "Test Buyer",
        email: "st-buyer@example.test",
        phone: "+32470000000",
        country: "BE",
        city: "Bruxelles",
        address: "1 rue du test",
        locale: "fr",
        ...over,
      })
      .returning()
    await db
      .insert(orderItems)
      .values({ orderId: row!.id, productId, ref: "R", title: "x", unitMinor: 3_400, quantity: 1 })
    return row!
  }
  const audit = (orderId: string) => db.select().from(orderAudit).where(eq(orderAudit.orderId, orderId))
  const statusOf = async (orderId: string) => (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.status

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const [cat] = await db
      .insert(categories)
      .values({ slug: "tst-st", name: { fr: "Test" } })
      .returning()
    const [p] = await db
      .insert(products)
      .values({
        ref: "TST-ST",
        slug: "tst-st",
        categoryId: cat!.id,
        title: { fr: "x" },
        priceTnd: 40_000,
        priceEur: 3_400,
        stock: 5,
        status: "published",
      })
      .returning()
    productId = p!.id
  })

  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.number, "TST-ST-%"))
    const ids = mine.map((o) => o.id)
    if (ids.length) {
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.delete(invoiceCounters).where(eq(invoiceCounters.year, 2096))
    await db.delete(products).where(eq(products.id, productId))
    await db.delete(categories).where(eq(categories.slug, "tst-st"))
  })

  test("a demo order is never checked by the konnect gateway", async () => {
    const ref = demoRef({
      outcome: "pending",
      orderNumber: "TST-ST-demo",
      amountMinor: 3_400,
      currency: "EUR",
      nonce: newDemoNonce(),
    })
    const o = await order({ paymentProvider: "demo", paymentRef: ref })
    const before = checks
    await settleOrder(services, ref)
    expect(checks).toBe(before)
    expect(await statusOf(o.id)).toBe("pending_payment")
  })

  test("past the hold, a konnect order stays pending while no konnect keys can be used", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000)
    const o = await order({ createdAt: old })
    const demoOnly = { ...services, payments: new DemoProvider("https://web.test") } as Services
    await releaseExpiredHolds(demoOnly, new Date(), { only: [o.id] })
    expect(await statusOf(o.id)).toBe("pending_payment")
    await releaseExpiredHolds(services, new Date(), { only: [o.id] })
    expect(await statusOf(o.id)).toBe("cancelled")
  })

  test("a konnect order is never judged by the demo gateway when the keys are gone", async () => {
    const o = await order()
    const demoOnly = { ...services, payments: new DemoProvider("https://web.test") } as Services
    await settleOrder(demoOnly, o.paymentRef!)
    expect(await statusOf(o.id)).toBe("pending_payment")
  })

  test("settleOrder asks the gateway built from the saved keys, not the env one", async () => {
    const o = await order()
    const { payment } = getPaymentResponse({ orderId: o.number, amount: 3_400, token: "EUR" })
    const [admin] = await db.select({ id: admins.id }).from(admins).limit(1)
    const withKeys = {
      ...services,
      payments: {
        name: "demo",
        mode: "test",
        init: async () => ({ payUrl: "x", ref: "x" }),
        check: async () => {
          throw new Error("the env gateway must not be asked")
        },
      },
      secrets: parseKeyring(`1:${Buffer.alloc(32, 5).toString("base64")}`),
      http: (async () => Response.json({ payment })) as unknown as typeof fetch,
    } as unknown as Services
    try {
      await saveIntegration(withKeys, admin!.id, "konnect", {
        config: { walletId: "wallet-123456", mode: "test" },
        secrets: { apiKey: "settle-test-key-0001" },
      })
      await settleOrder(withKeys, o.paymentRef!)
      expect(await statusOf(o.id)).toBe("paid")
    } finally {
      await clearIntegration(db, "konnect", admin!.id, new Date())
    }
  })

  test("a matching paid answer pays once even with concurrent calls, and sends one email set", async () => {
    const o = await order()
    answer = konnectAnswer({ orderId: o.number }, "paid")
    sent.length = 0
    await Promise.all([settleOrder(services, o.paymentRef!), settleOrder(services, o.paymentRef!)])
    expect(await statusOf(o.id)).toBe("paid")
    const toBuyer = sent.filter((m) => m.to === "st-buyer@example.test")
    expect(toBuyer).toHaveLength(1)
    expect(await audit(o.id)).toHaveLength(0)
    const kinds = (await db.select().from(mailLog).where(eq(mailLog.orderId, o.id))).map((r) => r.kind)
    expect(kinds).not.toContain("payment_received")
  })

  test("an amount off by one stays pending and leaves one gateway_mismatch row, however often it is asked", async () => {
    const o = await order()
    answer = konnectAnswer({ orderId: o.number, amount: 3_399 }, "paid")
    await settleOrder(services, o.paymentRef!)
    await settleOrder(services, o.paymentRef!)
    expect(await statusOf(o.id)).toBe("pending_payment")
    const rows = await audit(o.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: "gateway_mismatch", adminId: null, fromStatus: "pending_payment" })
    expect(rows[0]!.note).toContain("3399")
    expect(rows[0]!.note).not.toContain("st-buyer@example.test")
  })

  test("concurrent mismatch answers leave exactly one gateway_mismatch row", async () => {
    const o = await order()
    answer = konnectAnswer({ orderId: o.number, amount: 100 }, "paid")
    await Promise.all(Array.from({ length: 6 }, () => settleOrder(services, o.paymentRef!)))
    expect(await audit(o.id)).toHaveLength(1)
  })

  test("a wrong amount first, then the right one, still settles with the mismatch row kept and one email", async () => {
    const o = await order()
    answer = konnectAnswer({ orderId: o.number, amount: 3_000 }, "paid")
    await settleOrder(services, o.paymentRef!)
    expect(await statusOf(o.id)).toBe("pending_payment")
    sent.length = 0
    answer = konnectAnswer({ orderId: o.number }, "paid")
    await Promise.all([settleOrder(services, o.paymentRef!), settleOrder(services, o.paymentRef!)])
    expect(await statusOf(o.id)).toBe("paid")
    expect(await audit(o.id)).toHaveLength(1)
    expect(sent.filter((m) => m.to === "st-buyer@example.test")).toHaveLength(1)
  })

  test("a wrong currency or a wrong order number is a mismatch too", async () => {
    const wrongCurrency = await order()
    answer = konnectAnswer({ orderId: wrongCurrency.number, token: "TND" }, "paid")
    await settleOrder(services, wrongCurrency.paymentRef!)
    expect(await statusOf(wrongCurrency.id)).toBe("pending_payment")
    expect((await audit(wrongCurrency.id))[0]?.action).toBe("gateway_mismatch")

    const wrongNumber = await order()
    answer = konnectAnswer({ orderId: "CER-OTHER" }, "paid")
    await settleOrder(services, wrongNumber.paymentRef!)
    expect(await statusOf(wrongNumber.id)).toBe("pending_payment")
    expect((await audit(wrongNumber.id))[0]?.action).toBe("gateway_mismatch")
  })

  test("a failed answer cancels the order and puts the piece back", async () => {
    const o = await order()
    const [before] = await db.select().from(products).where(eq(products.id, productId))
    answer = konnectAnswer({ orderId: o.number, status: "failed" }, "failed")
    expect(await settleOrder(services, o.paymentRef!)).toMatchObject({ status: "cancelled" })
    const [after] = await db.select().from(products).where(eq(products.id, productId))
    expect(after!.stock).toBe(before!.stock + 1)
  })

  test("a paid answer for an order already cancelled records one late_payment row and keeps it cancelled", async () => {
    const o = await order({ status: "cancelled" })
    answer = konnectAnswer({ orderId: o.number }, "paid")
    await settleOrder(services, o.paymentRef!)
    const checksAfterFirst = checks
    await settleOrder(services, o.paymentRef!)
    expect(checks).toBe(checksAfterFirst)
    expect(await statusOf(o.id)).toBe("cancelled")
    const rows = await audit(o.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: "late_payment", fromStatus: "cancelled", toStatus: "cancelled" })
  })

  test("an unknown ref is null and does not ask the gateway", async () => {
    const before = checks
    expect(await settleOrder(services, "nope")).toBeNull()
    expect(checks).toBe(before)
  })
})
