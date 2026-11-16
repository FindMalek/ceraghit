import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { categories, createDb, mailLog, orderAudit, orderItems, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { DEFAULT_HOLDS, type HoldSettings } from "@workspace/sdk"
import { eq, inArray } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import type { Mail } from "../src/lib/mailer"
import { cancelOrder, releaseExpiredHolds, sendExpiryMails } from "../src/lib/orders"
import { DemoProvider } from "../src/lib/payments"
import { getPaymentSettings, savePaymentSettings } from "../src/lib/settings"

const url = process.env.DATABASE_URL
const DAY = 864e5

describe.skipIf(!url)("unpaid offline order expiry", () => {
  const db = createDb(url!)
  const tag = `hp${Date.now().toString(36)}`
  const sent: Mail[] = []
  const clock = new Date("2090-01-20T10:00:00Z")
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async (mail) => void sent.push(mail) },
    storage: null,
    auth: new AdminAuth(db),
    now: () => clock,
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const mine: string[] = []
  const sweep = (limit?: number) => releaseExpiredHolds(services, clock, { only: mine, limit })
  const ours = (): Mail[] => sent.filter((m) => m.to.startsWith(tag))
  let categoryId = ""
  let originalPayments: unknown
  let seq = 0

  const setHolds = async (holds: Partial<HoldSettings>) => {
    const current = await getPaymentSettings(db, services.config)
    await savePaymentSettings(db, { ...current, holds: { ...DEFAULT_HOLDS, ...holds } })
  }

  /** An unpaid order of `method`, created `ageDays` before the fake clock, holding one piece of a fresh product. */
  const place = async (
    method: "transfer" | "cod" | "online",
    ageDays: number,
    status: "pending_payment" | "paid" = "pending_payment",
  ) => {
    const n = seq++
    const [product] = await db
      .insert(products)
      .values({
        ref: `${tag}-${n}`,
        slug: `${tag}-${n}`,
        categoryId,
        title: { fr: "Vase" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 0,
        status: "published",
      })
      .returning()
    const [order] = await db
      .insert(orders)
      .values({
        number: `${tag}-${n}`,
        publicToken: "t",
        status,
        paymentMethod: method,
        currency: "EUR",
        subtotalMinor: 1_200,
        totalMinor: 1_200,
        customerName: "Hold Buyer",
        email: `${tag}-${n}@example.test`,
        phone: "+32470000000",
        country: "BE",
        city: "Bruxelles",
        address: "1 rue du test",
        locale: "en",
        createdAt: new Date(clock.getTime() - ageDays * DAY),
      })
      .returning()
    await db.insert(orderItems).values({
      orderId: order!.id,
      productId: product!.id,
      ref: product!.ref,
      title: "Vase",
      unitMinor: 1_200,
      quantity: 1,
    })
    mine.push(order!.id)
    return { order: order!, productId: product!.id }
  }
  const state = async (o: { order: { id: string }; productId: string }) => {
    const [row] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, o.order.id))
    const [piece] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, o.productId))
    const audit = await db.select().from(orderAudit).where(eq(orderAudit.orderId, o.order.id))
    return { status: row!.status, stock: piece!.stock, audit }
  }

  beforeAll(async () => {
    await runMigrations(db)
    const [row] = await db.select().from(settings).where(eq(settings.key, "payments"))
    originalPayments = row?.value
    const [category] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: tag }, visible: true, position: 0 })
      .returning()
    categoryId = category!.id
  })

  afterAll(async () => {
    if (originalPayments === undefined) await db.delete(settings).where(eq(settings.key, "payments"))
    else await db.update(settings).set({ value: originalPayments }).where(eq(settings.key, "payments"))
    const ids = (await db.select({ id: products.id }).from(products).where(eq(products.categoryId, categoryId))).map(
      (p) => p.id,
    )
    const items = ids.length
      ? await db.select({ orderId: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productId, ids))
      : []
    if (items.length)
      await db.delete(orders).where(
        inArray(
          orders.id,
          items.map((i) => i.orderId),
        ),
      )
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
  })

  test("a transfer order stays at day 6, is released at day 8 with stock back, one audit row and one mail", async () => {
    await setHolds({ transferDays: 7 })
    const day6 = await place("transfer", 6)
    const day8 = await place("transfer", 8)
    await sweep()
    expect(await state(day6)).toMatchObject({ status: "pending_payment", stock: 0 })
    const released = await state(day8)
    expect(released).toMatchObject({ status: "cancelled", stock: 1 })
    expect(released.audit).toHaveLength(1)
    expect(released.audit[0]).toMatchObject({
      action: "hold_expired",
      adminId: null,
      fromStatus: "pending_payment",
      toStatus: "cancelled",
    })
    expect(ours()).toHaveLength(0) // a sweep releases, only sendExpiryMails tells the customer
    await sendExpiryMails(services)
    const mails = ours().filter((m) => m.to === day8.order.email)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.subject).toContain(day8.order.number)
    expect(ours().filter((m) => m.to === day6.order.email)).toHaveLength(0)

    await sweep()
    await sendExpiryMails(services)
    expect((await state(day8)).audit).toHaveLength(1)
    expect(ours().filter((m) => m.to === day8.order.email)).toHaveLength(1)
  })

  test("cash on delivery never expires by default and follows codDays once set", async () => {
    await setHolds({ codDays: null })
    const cod = await place("cod", 30)
    await sweep()
    expect((await state(cod)).status).toBe("pending_payment")

    await setHolds({ codDays: 3 })
    const fresh = await place("cod", 2)
    const old = await place("cod", 4)
    await sweep()
    expect((await state(fresh)).status).toBe("pending_payment")
    expect((await state(old)).status).toBe("cancelled")
    expect((await state(cod)).status).toBe("cancelled")
  })

  test("a paid order is never released, and cancelOrder with onlyPending leaves it alone", async () => {
    await setHolds({ transferDays: 1 })
    const paid = await place("transfer", 20, "paid")
    await sweep()
    expect(await state(paid)).toMatchObject({ status: "paid", stock: 0 })
    expect(
      await cancelOrder(db, paid.order.id, "cancelled", { adminId: null, action: "hold_expired", onlyPending: true }),
    ).toBe(false)
    expect((await state(paid)).audit).toHaveLength(0)
  })

  test("the 45 minute card hold is unchanged", async () => {
    await setHolds({ transferDays: null })
    const card = await place("online", 0)
    await db
      .update(orders)
      .set({ createdAt: new Date(clock.getTime() - 50 * 60_000) })
      .where(eq(orders.id, card.order.id))
    await sweep()
    expect(await state(card)).toMatchObject({ status: "cancelled", stock: 1 })
  })

  test("a lazy sweep releases at most its limit, the next one continues", async () => {
    await setHolds({ transferDays: 7 })
    const a = await place("transfer", 10)
    const b = await place("transfer", 9)
    const c = await place("transfer", 8)
    expect(await sweep(2)).toBe(2)
    expect((await Promise.all([a, b, c].map(state))).map((o) => o.status)).toEqual([
      "cancelled",
      "cancelled",
      "pending_payment",
    ])
    expect(await sweep(2)).toBe(1)
    expect((await state(c)).status).toBe("cancelled")
  })

  test("a failing mailer does not undo or fail the release", async () => {
    await setHolds({ transferDays: 7 })
    const late = await place("transfer", 9)
    await sweep()
    const failing: Services = {
      ...services,
      mailer: {
        send: async () => {
          throw new Error("smtp down")
        },
      },
    }
    await expect(sendExpiryMails(failing)).resolves.toBeGreaterThanOrEqual(1)
    expect((await state(late)).status).toBe("cancelled")
    const [row] = await db.select().from(mailLog).where(eq(mailLog.orderId, late.order.id))
    expect(row).toMatchObject({ kind: "order_expired", status: "failed" })
  })

  test("a stored row from before holds existed reads as the defaults", async () => {
    await db
      .update(settings)
      .set({ value: { methods: { online: false, cod: true, transfer: true } } })
      .where(eq(settings.key, "payments"))
    expect((await getPaymentSettings(db, services.config)).holds).toEqual(DEFAULT_HOLDS)
  })
})
