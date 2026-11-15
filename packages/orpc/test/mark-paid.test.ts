import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, invoiceCounters, invoices, orderAudit, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import type { Mail } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("manual payment confirmation", () => {
  const db = createDb(url!)
  const sent: Mail[] = []
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async (mail) => void sent.push(mail) },
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2096-03-10T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const clientFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(services, headers) })
  let owner: ReturnType<typeof clientFor>
  let seq = 0

  const order = async (over: Partial<typeof orders.$inferInsert> = {}) => {
    const [row] = await db
      .insert(orders)
      .values({
        number: `TST-MP-${Date.now()}-${seq++}`,
        publicToken: "t",
        status: "pending_payment",
        paymentMethod: "transfer",
        currency: "EUR",
        subtotalMinor: 2_400,
        totalMinor: 2_400,
        customerName: "Test Buyer",
        email: "mp-buyer@example.test",
        phone: "+32470000000",
        country: "BE",
        city: "Bruxelles",
        address: "1 rue du test",
        locale: "en",
        ...over,
      })
      .returning()
    return row!
  }
  const echo = (o: { id: string; totalMinor: number; currency: "TND" | "EUR" }) => ({
    id: o.id,
    method: "payoneer" as const,
    reference: "PAY-123",
    note: "received this morning",
    totalMinor: o.totalMinor,
    currency: o.currency,
  })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    owner = clientFor(new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }))
  })

  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.number, "TST-MP-%"))
    const ids = mine.map((o) => o.id)
    if (ids.length) {
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.delete(invoiceCounters).where(eq(invoiceCounters.year, 2096))
  })

  test("a double click pays once, writes one audit row and sends one email", async () => {
    sent.length = 0
    const o = await order()
    const results = await Promise.all([owner.orders.markPaidManually(echo(o)), owner.orders.markPaidManually(echo(o))])
    expect(results.map((r) => r.alreadyPaid).sort()).toEqual([false, true])

    const [paid] = await db.select().from(orders).where(eq(orders.id, o.id))
    expect(paid).toMatchObject({ status: "paid", paymentProvider: "manual" })
    expect(paid!.paidAt).toEqual(services.now())

    const audit = await owner.orders.audit({ id: o.id })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      action: "mark_paid_manually",
      fromStatus: "pending_payment",
      toStatus: "paid",
      method: "payoneer",
      reference: "PAY-123",
      note: "received this morning",
      adminName: "Sabri Ghit",
    })
    expect(sent.filter((m) => m.to === o.email)).toHaveLength(1)
  })

  test("cancelled and card orders cannot be marked paid", async () => {
    const cancelled = await order({ status: "cancelled" })
    await expect(owner.orders.markPaidManually(echo(cancelled))).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const card = await order({ paymentMethod: "online" })
    await expect(owner.orders.markPaidManually(echo(card))).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect((await db.select().from(orders).where(eq(orders.id, card.id)))[0]!.status).toBe("pending_payment")
  })

  test("the amount and currency the owner saw must still match", async () => {
    const o = await order()
    await expect(owner.orders.markPaidManually({ ...echo(o), totalMinor: o.totalMinor - 1 })).rejects.toMatchObject({
      code: "CONFLICT",
    })
    await expect(owner.orders.markPaidManually({ ...echo(o), currency: "TND" })).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(await db.select().from(orderAudit).where(eq(orderAudit.orderId, o.id))).toHaveLength(0)
  })

  test("a visitor cannot confirm a payment", async () => {
    const visitor = clientFor(new Headers({ "x-csrf-token": "orpc" }))
    const o = await order()
    await expect(visitor.orders.markPaidManually(echo(o))).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("cancelling from the dashboard is audited with who and from which status", async () => {
    const o = await order()
    await owner.orders.setStatus({ id: o.id, status: "cancelled" })
    const [row] = await owner.orders.audit({ id: o.id })
    expect(row).toMatchObject({
      action: "set_status",
      fromStatus: "pending_payment",
      toStatus: "cancelled",
      adminName: "Sabri Ghit",
    })
  })

  test("setStatus paid goes through the audit and the email", async () => {
    sent.length = 0
    const o = await order()
    await owner.orders.setStatus({ id: o.id, status: "paid" })
    const rows = await owner.orders.audit({ id: o.id })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: "mark_paid_manually", method: "transfer", toStatus: "paid" })
    expect(sent.filter((m) => m.to === o.email)).toHaveLength(1)
  })

  test("paying and cancelling at the same time never leaves a state the audit does not explain", async () => {
    const o = await order()
    await Promise.allSettled([
      owner.orders.markPaidManually(echo(o)),
      owner.orders.setStatus({ id: o.id, status: "cancelled" }),
    ])
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id))
    const audit = await owner.orders.audit({ id: o.id })
    expect(audit[0]!.toStatus).toBe(row!.status)
    expect(audit.filter((a) => a.action === "mark_paid_manually")).toHaveLength(row!.paidAt ? 1 : 0)
  })
})
