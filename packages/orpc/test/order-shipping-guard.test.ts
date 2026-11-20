import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, orderItems, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { and, eq, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { createOrder } from "../src/lib/orders"
import { DemoProvider } from "../src/lib/payments"
import { saveShippingSettings } from "../src/lib/shipping/settings"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("the delivery price the customer saw", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => undefined },
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: false,
    },
  }
  const email = `guard-${Date.now()}@example.test`
  let productId = ""
  let stock = 0

  const place = (over: Record<string, unknown> = {}) =>
    createOrder(services, {
      items: [{ productId, quantity: 1 }],
      currency: "TND",
      locale: "fr",
      paymentMethod: "cod",
      customerName: "Guard Buyer",
      email,
      phone: "+21620000000",
      country: "TN",
      city: "Tunis",
      address: "1 rue du test",
      ...over,
    } as Parameters<typeof createOrder>[1])
  const stockNow = async () => (await db.query.products.findFirst({ where: eq(products.id, productId) }))!.stock

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true })
    const piece = await db.query.products.findFirst({
      where: and(eq(products.status, "published"), eq(products.quoteOnly, false), eq(products.unique, false)),
      with: { variants: true },
    })
    if (!piece || piece.variants.length > 0) throw new Error("no plain published piece in the seed")
    productId = piece.id
    await db.update(products).set({ stock: 50 }).where(eq(products.id, productId))
    stock = 50
  })
  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.email, "guard-%@example.test"))
    for (const { id } of mine) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id))
      await db.delete(orders).where(eq(orders.id, id))
    }
    await db.update(products).set({ stock }).where(eq(products.id, productId))
    await db.close()
  })

  test("the price the customer saw is the price charged", async () => {
    const probe = await place()
    const shipping = (await db.query.orders.findFirst({ where: eq(orders.number, probe.number) }))!.shippingMinor
    const before = await stockNow()
    const order = await place({ expectedShippingMinor: shipping })
    const row = (await db.query.orders.findFirst({ where: eq(orders.number, order.number) }))!
    expect(row.shippingMinor).toBe(shipping)
    expect(await stockNow()).toBe(before - 1)
  })

  test("a different delivery price is refused before any piece is held", async () => {
    const before = await stockNow()
    const count = (await db.select({ id: orders.id }).from(orders).where(eq(orders.email, email))).length
    await expect(place({ expectedShippingMinor: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "shipping_changed" },
    })
    expect(await stockNow()).toBe(before)
    expect((await db.select({ id: orders.id }).from(orders).where(eq(orders.email, email))).length).toBe(count)
  })

  test("with Aramex pricing on, a client that sends no price is still charged the flat rate it was shown", async () => {
    const flat = (await db.query.orders.findFirst({ where: eq(orders.number, (await place()).number) }))!.shippingMinor
    await saveShippingSettings(db, { provider: "aramex", quoteFromProvider: true })
    try {
      const order = await place()
      const row = (await db.query.orders.findFirst({ where: eq(orders.number, order.number) }))!
      expect(row.shippingMinor).toBe(flat)
    } finally {
      await db.delete(settings).where(eq(settings.key, "shipping"))
    }
  })
})
