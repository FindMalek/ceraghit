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
import { getShopProfile, updateShopProfile } from "../src/lib/shop-profile"
import { appRouter } from "../src/routers"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

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
  let savedPayments: typeof settings.$inferSelect | undefined
  let savedProfile: Awaited<ReturnType<typeof getShopProfile>> | undefined

  const owner = (over: Partial<Services["config"]> = {}) =>
    createRouterClient(appRouter, {
      context: (): Context =>
        createContext(
          { ...services, config: { ...services.config, ...over } },
          visitorHeaders({ cookie, "x-csrf-token": "orpc" }),
        ),
    })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    ;[savedPayments] = await db.delete(settings).where(eq(settings.key, "payments")).returning()
    savedProfile = await getShopProfile(db)
    await updateShopProfile(db, {
      bankHolder: "Atelier Test",
      bankName: "Banque Test",
      bankIban: "TN5910006035183598478831",
    })
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
    await clearVisitorLimits(db)
    await db.delete(settings).where(eq(settings.key, "payments"))
    if (savedPayments) await db.insert(settings).values(savedPayments)
    if (savedProfile)
      await updateShopProfile(db, {
        bankHolder: savedProfile.bankHolder,
        bankName: savedProfile.bankName,
        bankIban: savedProfile.bankIban,
      })
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

  test("saving without holds (an older dashboard tab) keeps the stored windows", async () => {
    const client = owner()
    const methods = { online: false, cod: true, transfer: true }
    await client.admin.settings.savePayments({ methods, holds: { transferDays: 12, codDays: 5, warnDays: 3 } })
    await client.admin.settings.savePayments({ methods })
    expect((await client.admin.settings.getPayments()).settings.holds).toEqual({
      transferDays: 12,
      codDays: 5,
      warnDays: 3,
    })
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

  test("card saved alone falls back to cod and transfer once the gateway stops being ready", async () => {
    await db
      .insert(settings)
      .values({ key: "payments", value: { methods: { online: true, cod: false, transfer: false } } })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: { methods: { online: true, cod: false, transfer: false } } },
      })
    expect((await owner({ appEnv: "production" }).public.catalog.settings()).paymentMethods).toEqual({
      online: false,
      cod: true,
      transfer: true,
    })
  })

  test("saving cannot leave Tunisia without a way to pay", async () => {
    await expect(
      owner().admin.settings.savePayments({ methods: { online: false, cod: false, transfer: true } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Tunisie") })
  })
})
