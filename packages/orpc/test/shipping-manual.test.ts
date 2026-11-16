import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, invoiceCounters, invoices, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"
import { adminRouter } from "../src/routers/admin"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("manual shipping", () => {
  const db = createDb(url!)
  const shipped: string[] = []
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => undefined },
    hooks: { orderShipped: async (id) => void shipped.push(id) },
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
        number: `TST-SH-${Date.now()}-${seq++}`,
        publicToken: "t",
        status: "pending_payment",
        paymentMethod: "transfer",
        currency: "EUR",
        subtotalMinor: 2_400,
        totalMinor: 2_400,
        customerName: "Test Buyer",
        email: "sh-buyer@example.test",
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
  const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, visitorHeaders()) })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    owner = clientFor(new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }))
  })

  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.number, "TST-SH-%"))
    const ids = mine.map((o) => o.id)
    if (ids.length) {
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.delete(invoiceCounters).where(eq(invoiceCounters.year, 2096))
    await clearVisitorLimits(db)
  })

  const row = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!

  test("a paid order ships once with the carrier link built from the template", async () => {
    shipped.length = 0
    const o = await order({
      status: "paid",
      paymentMethod: "online",
      paidAt: services.now(),
      publicToken: `tok-${seq}`,
    })
    await owner.orders.markShipped({ id: o.id, carrier: "aramex", trackingNumber: "12345678901" })
    const after = await row(o.id)
    expect(after).toMatchObject({
      status: "fulfilled",
      carrier: "aramex",
      trackingNumber: "12345678901",
      trackingUrl: "https://www.aramex.com/track/results?ShipmentNumber=12345678901",
    })
    expect(after.shippedAt).not.toBeNull()
    expect(shipped).toEqual([o.id])
    expect(await owner.orders.markShipped({ id: o.id, carrier: "dhl" }).catch((e) => e.code)).toBe("BAD_REQUEST")
    expect(shipped).toHaveLength(1)
    expect((await owner.orders.audit({ id: o.id })).map((a) => a.toStatus)).toEqual(["fulfilled"])
  })

  test("cash on delivery ships while pending and counts as paid", async () => {
    const o = await order({ paymentMethod: "cod", currency: "TND", country: "TN" })
    await owner.orders.markShipped({ id: o.id, carrier: "other", carrierName: "Livraison en main propre" })
    expect(await row(o.id)).toMatchObject({
      status: "fulfilled",
      paymentProvider: "cod",
      carrierName: "Livraison en main propre",
    })
    expect((await row(o.id)).paidAt).not.toBeNull()
  })

  test("a transfer order that is not paid cannot ship", async () => {
    shipped.length = 0
    const o = await order()
    expect(await owner.orders.markShipped({ id: o.id, carrier: "dhl" }).catch((e) => e.code)).toBe("BAD_REQUEST")
    expect(await row(o.id)).toMatchObject({ status: "pending_payment", carrier: null, shippedAt: null })
    expect(shipped).toEqual([])
  })

  test("a link that is not https is refused", async () => {
    const o = await order({ status: "paid", paidAt: services.now() })
    const bad = "javascript:alert(1)"
    expect(await owner.orders.markShipped({ id: o.id, carrier: "dhl", trackingUrl: bad }).catch((e) => e.code)).toBe(
      "BAD_REQUEST",
    )
    expect(
      await owner.orders.markShipped({ id: o.id, carrier: "dhl", trackingUrl: "http://x.test/t" }).catch((e) => e.code),
    ).toBe("BAD_REQUEST")
    expect((await row(o.id)).status).toBe("paid")
  })

  test("a failing hook never fails the shipment", async () => {
    const o = await order({ status: "paid", paidAt: services.now() })
    const keep = services.hooks
    services.hooks = { orderShipped: async () => Promise.reject(new Error("boom")) }
    const spy = console.error
    console.error = () => {}
    try {
      await owner.orders.markShipped({ id: o.id, carrier: "rapid-poste" })
    } finally {
      console.error = spy
      services.hooks = keep
    }
    expect((await row(o.id)).status).toBe("fulfilled")
  })

  test("updating the tracking edits the numbers without a second hook call, and the page shows only its own order", async () => {
    shipped.length = 0
    const token = `tok-${Date.now()}-${seq}`
    const o = await order({ status: "paid", paidAt: services.now(), publicToken: token })
    const other = await order({ status: "paid", paidAt: services.now(), publicToken: `${token}-b` })
    expect((await guest.public.orders.get({ number: o.number, token })).shipping).toBeNull()
    await owner.orders.markShipped({ id: o.id, carrier: "aramex", trackingNumber: "111" })
    await owner.orders.updateTracking({ id: o.id, carrier: "aramex", trackingNumber: "222" })
    expect(shipped).toHaveLength(1)
    const view = await guest.public.orders.get({ number: o.number, token })
    expect(view.shipping).toMatchObject({ carrier: "aramex", trackingNumber: "222" })
    expect(await guest.public.orders.get({ number: o.number, token: `${token}-b` }).catch((e) => e.code)).toBe(
      "NOT_FOUND",
    )
    expect((await guest.public.orders.get({ number: other.number, token: `${token}-b` })).shipping).toBeNull()
    expect(await owner.orders.updateTracking({ id: other.id, carrier: "dhl" }).catch((e) => e.code)).toBe("BAD_REQUEST")
  })

  test("editing the tracking of an order shipped before tracking existed keeps its date empty", async () => {
    const o = await order({ status: "fulfilled", paymentMethod: "online", paidAt: services.now() })
    await owner.orders.updateTracking({ id: o.id, carrier: "dhl", trackingNumber: "999" })
    const after = await row(o.id)
    expect(after.trackingNumber).toBe("999")
    expect(after.shippedAt).toBeNull()
  })
})
