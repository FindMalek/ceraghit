import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("payment settings", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const tag = `pay${Date.now()}`
  const email = `${tag}@example.com`
  let categoryId = ""
  let productId = ""
  let cookie = ""

  const owner = (over: Partial<Services["config"]> = {}) =>
    createRouterClient(appRouter, {
      context: (): Context =>
        createContext(
          { ...services, config: { ...services.config, ...over } },
          new Headers({ cookie, "x-csrf-token": "orpc" }),
        ),
    })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    await db.delete(settings).where(eq(settings.key, "payments"))
    const [cat] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: "Test" } })
      .returning()
    categoryId = cat!.id
    const [p] = await db
      .insert(products)
      .values({
        ref: tag,
        slug: tag,
        categoryId,
        title: { fr: "Bol" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 5,
        status: "published",
      })
      .returning()
    productId = p!.id
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    cookie = `ceraghit_admin=${session!.token}`
  })

  afterAll(async () => {
    await db.delete(settings).where(eq(settings.key, "payments"))
    await db.delete(orders).where(eq(orders.email, email))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  test("production refuses to switch card on while only the demo gateway is configured", async () => {
    const prod = owner({ appEnv: "production" })
    expect((await prod.admin.settings.getPayments()).gatewayReady).toBe(false)
    await expect(
      prod.admin.settings.savePayments({ methods: { online: true, cod: true, transfer: true } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Card payment needs the Konnect live keys." })
  })

  test("a method switched off disappears from the storefront and createOrder refuses it", async () => {
    const client = owner()
    await client.admin.settings.savePayments({ methods: { online: true, cod: false, transfer: true } })
    expect((await client.public.catalog.settings()).paymentMethods).toEqual({
      online: true,
      cod: false,
      transfer: true,
    })

    const order = {
      items: [{ productId, quantity: 1 }],
      currency: "TND" as const,
      customerName: "Test Buyer",
      email,
      phone: "+21620000000",
      country: "TN" as const,
      city: "Tunis",
      address: "1 rue du test",
    }
    await expect(client.public.orders.create({ ...order, paymentMethod: "cod" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This payment method is not available for your country.",
    })
    const card = await client.public.orders.create(order)
    expect((await client.public.orders.get({ number: card.number, token: card.token })).paymentMethod).toBe("online")
  })

  test("saving cannot leave Tunisia without a way to pay", async () => {
    await expect(
      owner().admin.settings.savePayments({ methods: { online: false, cod: false, transfer: true } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Tunisie") })
  })
})
