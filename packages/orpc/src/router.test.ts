import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, orders, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "./context"
import { AdminAuth } from "./lib/auth"
import { DemoProvider, KonnectProvider } from "./lib/payments"
import { appRouter } from "./routers"
import { adminRouter } from "./routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("router", () => {
  const db = createDb(url!)
  const payments = new DemoProvider("https://web.test")
  let clock = new Date()
  const services: Services = {
    db,
    payments,
    storage: null,
    auth: new AdminAuth(db),
    now: () => clock,
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
    },
  }
  const clientWith = (headers: Record<string, string> = {}) =>
    createRouterClient(appRouter, { context: (): Context => createContext(services, new Headers(headers)) })
  const guest = clientWith()
  const tag = `t${Date.now()}`
  let categoryId = ""
  const ids: Record<string, string> = {}

  const customer = {
    currency: "TND" as const,
    customerName: "Test Buyer",
    email: "buyer@example.com",
    phone: "+21620000000",
    country: "TN" as const,
    city: "Tunis",
    address: "1 rue du test",
  }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const [cat] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: "Test" } })
      .returning()
    categoryId = cat!.id
    const make = async (key: string, over: Partial<typeof products.$inferInsert>) => {
      const [p] = await db
        .insert(products)
        .values({
          ref: `${tag}-${key}`,
          slug: `${tag}-${key}`,
          categoryId,
          title: { fr: key },
          priceTnd: 40_000,
          priceEur: 1_200,
          stock: 5,
          status: "published",
          ...over,
        })
        .returning()
      ids[key] = p!.id
    }
    await make("mug", {})
    await make("vase", { unique: true, stock: 1, priceTnd: 500_000, priceEur: 15_000 })
    await make("fountain", { quoteOnly: true, stock: 1 })
  })

  afterAll(async () => {
    const all = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, customer.email))
    if (all.length)
      await db.delete(orders).where(
        inArray(
          orders.id,
          all.map((o) => o.id),
        ),
      )
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  test("no admin procedure answers a visitor", async () => {
    const visitor = createRouterClient(adminRouter, { context: (): Context => createContext(services, new Headers()) })
    type Call = (input?: unknown) => Promise<unknown>
    const leaves: [string, Call][] = []
    const walk = (node: object, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value !== "object" || value === null) continue
        if ("~orpc" in value) {
          const call = path.reduce<unknown>((client, step) => (client as Record<string, unknown>)[step], visitor)
          leaves.push([[...path, key].join("."), (call as Record<string, Call>)[key] as Call])
        } else walk(value, [...path, key])
      }
    }
    walk(adminRouter, [])
    const open = leaves.filter(([name]) => !["auth.login", "auth.logout"].includes(name))
    expect(open.length).toBeGreaterThan(20)
    for (const [name, call] of open) {
      await expect(call({}), name).rejects.toMatchObject({ code: expect.stringMatching(/UNAUTHORIZED|FORBIDDEN/) })
    }
  })

  test("a TND order holds stock, is paid only after the gateway says so, and EUR uses the EUR price", async () => {
    const created = await guest.public.orders.create({
      ...customer,
      items: [{ productId: ids.mug!, quantity: 2 }],
      locale: "fr",
    })
    let [mug] = await db.select().from(products).where(eq(products.id, ids.mug!))
    expect(mug!.stock).toBe(3)
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    expect(order!.subtotalMinor).toBe(80_000)
    expect(order!.shippingMinor).toBeGreaterThan(0)
    expect(order!.totalMinor).toBe(80_000 + order!.shippingMinor)
    expect(order!.status).toBe("pending_payment")

    await guest.public.orders.demoResolve({ ref: order!.paymentRef!, outcome: "paid" })
    expect((await guest.public.orders.get({ number: created.number, token: created.token })).status).toBe("paid")

    const eur = await guest.public.orders.create({
      ...customer,
      currency: "EUR",
      country: "BE",
      items: [{ productId: ids.mug!, quantity: 1 }],
      locale: "en",
    })
    const [eurOrder] = await db.select().from(orders).where(eq(orders.number, eur.number))
    expect(eurOrder!.subtotalMinor).toBe(1_200)
    const quote = await guest.public.catalog.shippingQuote({
      items: [{ productId: ids.mug!, quantity: 1 }],
      country: "BE",
      currency: "EUR",
    })
    expect(quote).toMatchObject({ available: true, zoneName: "Europe" })
    expect(eurOrder!.shippingMinor).toBe(quote.amountMinor)
    ;[mug] = await db.select().from(products).where(eq(products.id, ids.mug!))
    expect(mug!.stock).toBe(2)
  })

  test("a unique piece sells once, a quote-only piece never goes through the cart", async () => {
    await guest.public.orders.create({ ...customer, items: [{ productId: ids.vase!, quantity: 1 }], locale: "fr" })
    await expect(
      guest.public.orders.create({ ...customer, items: [{ productId: ids.vase!, quantity: 1 }], locale: "fr" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      guest.public.orders.create({ ...customer, items: [{ productId: ids.fountain!, quantity: 1 }], locale: "fr" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("an unpaid order gives its pieces back after the hold", async () => {
    const created = await guest.public.orders.create({
      ...customer,
      items: [{ productId: ids.mug!, quantity: 2 }],
      locale: "fr",
    })
    const [before] = await db.select().from(products).where(eq(products.id, ids.mug!))
    clock = new Date(Date.now() + 2 * 3600e3)
    await guest.public.orders.create({ ...customer, items: [{ productId: ids.mug!, quantity: 1 }], locale: "fr" })
    const [after] = await db.select().from(products).where(eq(products.id, ids.mug!))
    expect(after!.stock).toBeGreaterThanOrEqual(before!.stock + 1)
    expect((await db.select().from(orders).where(eq(orders.number, created.number)))[0]!.status).toBe("cancelled")
    clock = new Date()
  })

  test("a payment that does not match the order is not accepted", async () => {
    const created = await guest.public.orders.create({
      ...customer,
      items: [{ productId: ids.mug!, quantity: 1 }],
      locale: "fr",
    })
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    const wrong = new DemoProvider("https://web.test")
    wrong.check = async () => ({ status: "paid", amountMinor: 1, currency: "TND", orderNumber: order!.number })
    const { settleOrder } = await import("./lib/orders")
    await settleOrder({ ...services, payments: wrong }, order!.paymentRef!)
    expect((await db.select().from(orders).where(eq(orders.id, order!.id)))[0]!.status).toBe("pending_payment")
  })
})

test("konnect: amounts go in minor units with the currency as token, only `completed` is paid", async () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  const http = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return Response.json(
      url.includes("init-payment")
        ? { payUrl: "https://pay.test/x", paymentRef: "ref1" }
        : { payment: { status: "completed", amount: 3400, token: "EUR", orderId: "CER-1" } },
    )
  }) as unknown as typeof fetch
  const konnect = new KonnectProvider("key", "wallet", "test", http)
  const init = await konnect.init({
    orderNumber: "CER-1",
    amountMinor: 3400,
    currency: "EUR",
    customer: { name: "Ada Lovelace", email: "a@b.c", phone: "123" },
    description: "d",
    successUrl: "s",
    failUrl: "f",
    webhookUrl: "w",
  })
  expect(init).toEqual({ payUrl: "https://pay.test/x", ref: "ref1" })
  expect(calls[0]!.url).toBe("https://api.preprod.konnect.network/api/v2/payments/init-payment")
  expect(calls[0]!.body).toMatchObject({ amount: 3400, token: "EUR", receiverWalletId: "wallet" })
  expect(await konnect.check("ref1")).toEqual({
    status: "paid",
    amountMinor: 3400,
    currency: "EUR",
    orderNumber: "CER-1",
  })
})
