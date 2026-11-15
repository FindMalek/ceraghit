import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, mailLog, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { getShopProfile, updateShopProfile } from "../src/lib/shop-profile"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("order mails", () => {
  const db = createDb(url!)
  const sent: { to: string; text: string; subject: string }[] = []
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async (mail) => void sent.push({ to: mail.to, text: mail.text, subject: mail.subject }) },
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
  const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, new Headers()) })
  const tag = `em${Date.now()}`
  const email = "mail-buyer@example.com"
  const buyer = {
    currency: "EUR" as const,
    customerName: "Test Buyer",
    email,
    phone: "+32470000000",
    country: "BE" as const,
    city: "Bruxelles",
    address: "1 rue du test",
  }
  const account = { bankHolder: "Atelier Test", bankName: "Banque Test", bankBic: "BSTUTNTT" }
  let saved: Awaited<ReturnType<typeof getShopProfile>>
  let categoryId = ""
  let productId = ""
  let savedPayments: typeof settings.$inferSelect | undefined

  const setBank = (patch: { bankIban: string | null; bankRib: string | null }) =>
    updateShopProfile(db, { ...account, ...patch })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    ;[savedPayments] = await db.delete(settings).where(eq(settings.key, "payments")).returning()
    saved = await getShopProfile(db)
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
    if (savedPayments) await db.insert(settings).values(savedPayments).onConflictDoNothing()
    await updateShopProfile(db, {
      bankHolder: saved.bankHolder,
      bankName: saved.bankName,
      bankIban: saved.bankIban,
      bankRib: saved.bankRib,
      bankBic: saved.bankBic,
    })
    await db.delete(orders).where(eq(orders.email, email))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  const items = () => [{ productId, quantity: 1 }]

  test("a cash on delivery order sends the customer and studio mails, both logged", async () => {
    await updateShopProfile(db, { notifyEmail: "notify@studio.test" })
    const placed = await guest.public.orders.create({ ...buyer, country: "TN", currency: "TND", items: items() })
    const mine = sent.filter((m) => m.subject.includes(placed.number))
    expect(mine.map((m) => m.to).sort()).toEqual([email, "notify@studio.test"].sort())
    const [order] = await db.select().from(orders).where(eq(orders.number, placed.number))
    const logged = await db.select().from(mailLog).where(eq(mailLog.orderId, order!.id))
    expect(logged.map((l) => l.kind).sort()).toEqual(["order_confirmation", "order_studio"])
  })
})
