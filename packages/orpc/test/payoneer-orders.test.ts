import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { DEFAULT_HOLDS, DEFAULT_PAYONEER, type PayoneerSettings } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { savePaymentSettings } from "../src/lib/settings"
import { appRouter } from "../src/routers"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("payoneer orders", () => {
  const db = createDb(url!)
  const sent: { to: string; text: string }[] = []
  let gatewayCalls = 0
  class CountingProvider extends DemoProvider {
    override async init(...args: Parameters<DemoProvider["init"]>) {
      gatewayCalls++
      return super.init(...args)
    }
  }
  const services: Services = {
    db,
    payments: new CountingProvider("https://web.test"),
    mailer: { send: async (mail) => void sent.push({ to: mail.to, text: mail.text }) },
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
  const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, visitorHeaders()) })
  const tag = `po${Date.now()}`
  const email = "payoneer-buyer@example.com"
  const buyer = {
    currency: "EUR" as "EUR" | "TND",
    customerName: "Test Buyer",
    email,
    phone: "+32470000000",
    country: "BE" as "BE" | "TN",
    city: "Bruxelles",
    address: "1 rue du test",
    paymentMethod: "payoneer" as const,
  }
  let categoryId = ""
  let productId = ""
  let savedPayments: typeof settings.$inferSelect | undefined

  const configure = (payoneer: Partial<PayoneerSettings>, on = true) =>
    savePaymentSettings(db, {
      methods: { online: false, cod: true, transfer: false, payoneer: on },
      payoneer: { ...DEFAULT_PAYONEER, ...payoneer },
      holds: DEFAULT_HOLDS,
    })
  const place = async (extra: Partial<typeof buyer> = {}) => {
    const placed = await guest.public.orders.create({ ...buyer, ...extra, items: [{ productId, quantity: 1 }] })
    return { placed, get: () => guest.public.orders.get({ number: placed.number, token: placed.token }) }
  }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    ;[savedPayments] = await db.delete(settings).where(eq(settings.key, "payments")).returning()
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
        title: { fr: "Tasse" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 20,
        status: "published",
      })
      .returning()
    productId = p!.id
  })

  afterAll(async () => {
    await clearVisitorLimits(db)
    await db.delete(settings).where(eq(settings.key, "payments"))
    if (savedPayments) await db.insert(settings).values(savedPayments).onConflictDoNothing()
    await db.delete(orders).where(eq(orders.email, email))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  test("a per-order order waits for the owner's link, skips the gateway and keeps the pieces", async () => {
    await configure({ receiverEmail: "pay@shop.test", note: { fr: "Merci" } })
    const before = gatewayCalls
    const { placed, get } = await place()
    expect(gatewayCalls).toBe(before)
    const order = await get()
    expect(order.status).toBe("pending_payment")
    expect(order.payoneer).toEqual({
      link: null,
      receiverEmail: "pay@shop.test",
      note: "Merci",
      waitingForLink: true,
    })
    expect(sent.find((m) => m.to === email && m.text.includes(placed.number))?.text).toContain("Payoneer")
    const [row] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId))
    expect(row?.stock).toBe(19)
  })

  test("a single shop link is shown on the order page and in the email", async () => {
    const link = "https://link.payoneer.com/pay/shop"
    await configure({ mode: "static", staticLink: link })
    const { placed, get } = await place()
    expect((await get()).payoneer).toMatchObject({ link, waitingForLink: false })
    expect(sent.filter((m) => m.to === email && m.text.includes(placed.number)).at(-1)?.text).toContain(link)
  })

  test("Tunisia, dinars and a switched-off method are refused", async () => {
    await configure({})
    await expect(place({ country: "TN", currency: "TND" })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await configure({}, false)
    await expect(place()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("the payoneer block disappears once the order is paid", async () => {
    await configure({})
    const { placed, get } = await place()
    await db.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.number, placed.number))
    expect((await get()).payoneer).toBeNull()
  })
})
