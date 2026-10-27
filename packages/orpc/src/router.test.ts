import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, customRequests, orders, products, productVariants } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { asc, eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "./context"
import { AdminAuth } from "./lib/auth"
import { ConsoleMailer } from "./lib/mailer"
import { cancelOrder, releaseExpiredHolds } from "./lib/orders"
import { DemoProvider, KonnectProvider } from "./lib/payments"
import { createStorage, type Storage } from "./lib/storage"
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
    mailer: new ConsoleMailer(),
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
    await db.delete(customRequests).where(eq(customRequests.email, "photos@example.com"))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  test("a request keeps photos that were really uploaded and rejects the rest", async () => {
    const stored = new Set<string>()
    const storage: Storage = {
      bucket: "b",
      prefix: "pr-1/",
      presignPut: async (key, _type, size) => {
        stored.add(key)
        return `https://s3.test/${key}?size=${size}`
      },
      head: async (key) => stored.has(key),
      readUrl: async (key) => key,
      publicUrl: () => null,
      remove: async () => {},
    }
    const client = createRouterClient(appRouter, {
      context: (): Context => createContext({ ...services, storage }, new Headers()),
    })
    const request = {
      name: `Photo ${tag}`,
      email: "photos@example.com",
      description: "Un vase avec des motifs géométriques",
      locale: "fr" as const,
    }
    const { image } = await client.public.requests.uploadUrl({ contentType: "image/jpeg", size: 1000 })
    expect(image.startsWith("s3:pr-1/requests/")).toBe(true)

    await client.public.requests.create({ ...request, images: [image] })
    const [saved] = await db.select().from(customRequests).where(eq(customRequests.name, request.name))
    expect(saved?.images).toEqual([image])

    const foreign = { ...request, images: ["s3:pr-1/products/a.jpg"] }
    await expect(client.public.requests.create(foreign)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const missing = { ...request, images: ["s3:pr-1/requests/never-uploaded.jpg"] }
    await expect(client.public.requests.create(missing)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(guest.public.requests.uploadUrl({ contentType: "image/png", size: 10 })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    })
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
    const quote = await guest.public.catalog.shippingQuote({
      items: [{ productId: ids.vase!, quantity: 1 }],
      country: "TN",
      currency: "TND",
    })
    expect(quote).toMatchObject({ freeApplied: true, amountMinor: 0, freeOverMinor: 300_000, subtotalMinor: 500_000 })
    const big = await guest.public.orders.create({
      ...customer,
      items: [{ productId: ids.vase!, quantity: 1 }],
      locale: "fr",
    })
    const [bigOrder] = await db.select().from(orders).where(eq(orders.number, big.number))
    expect(bigOrder!.shippingMinor).toBe(0)
    await expect(
      guest.public.orders.create({ ...customer, items: [{ productId: ids.vase!, quantity: 1 }], locale: "fr" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      guest.public.orders.create({ ...customer, items: [{ productId: ids.fountain!, quantity: 1 }], locale: "fr" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("an ordered variant uses its own price and stock, and cancelling gives only that stock back", async () => {
    const [lamp] = await db
      .insert(products)
      .values({
        ref: `${tag}-lamp`,
        slug: `${tag}-lamp`,
        categoryId,
        title: { fr: "Lampe" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 0,
        status: "published",
      })
      .returning()
    const [, unglazed] = await db
      .insert(productVariants)
      .values([
        { productId: lamp!.id, label: { fr: "Émaillée" }, priceTnd: 40_000, priceEur: 1_200, stock: 2, position: 0 },
        { productId: lamp!.id, label: { fr: "Terre cuite" }, priceTnd: 30_000, priceEur: 900, stock: 2, position: 1 },
      ])
      .returning()
    const stocks = async () =>
      (
        await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, lamp!.id))
          .orderBy(asc(productVariants.position))
      ).map((v) => v.stock)

    await expect(
      guest.public.orders.create({ ...customer, items: [{ productId: lamp!.id, quantity: 1 }], locale: "fr" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const created = await guest.public.orders.create({
      ...customer,
      items: [{ productId: lamp!.id, variantId: unglazed!.id, quantity: 1 }],
      locale: "fr",
    })
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    expect(order!.subtotalMinor).toBe(30_000)
    expect(await stocks()).toEqual([2, 1])

    await cancelOrder(db, order!.id)
    expect(await stocks()).toEqual([2, 2])
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

  test("cash on delivery is Tunisia only, skips the gateway and mails the customer and the studio", async () => {
    const sent: string[] = []
    const cod = createRouterClient(appRouter, {
      context: (): Context =>
        createContext({ ...services, mailer: { send: async (mail) => void sent.push(mail.to) } }, new Headers()),
    })
    const items = [{ productId: ids.mug!, quantity: 1 }]
    await expect(
      cod.public.orders.create({ ...customer, country: "BE", paymentMethod: "cod", items }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const created = await cod.public.orders.create({ ...customer, paymentMethod: "cod", items })
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    expect(order).toMatchObject({
      paymentMethod: "cod",
      paymentProvider: "cod",
      paymentRef: null,
      status: "pending_payment",
    })
    expect(created.payUrl).toContain(`/order/${created.number}`)
    expect(sent.sort()).toEqual([customer.email, "ceraghit@yahoo.fr"].sort())

    clock = new Date(clock.getTime() + 24 * 60 * 60_000)
    expect((await cod.public.orders.get({ number: created.number, token: created.token })).status).toBe(
      "pending_payment",
    )
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

test("a request photo upload url binds the exact size and type", async () => {
  const storage = createStorage({
    endpoint: "https://s3.test",
    region: "garage",
    bucket: "b",
    accessKeyId: "AK",
    secretAccessKey: "SK",
    prefix: "",
  })
  const signed = new URL(await storage!.presignPut("requests/a.jpg", "image/jpeg", 1234))
  expect(signed.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length")
  expect(signed.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type")
})
