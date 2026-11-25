import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { getShopProfile, updateShopProfile } from "../src/lib/shop-profile"
import { appRouter } from "../src/routers"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("transfer needs a real bank account", () => {
  const db = createDb(url!)
  const sent: { to: string; text: string }[] = []
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
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
  const tag = `tr${Date.now()}`
  const email = "transfer-buyer@example.com"
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
    await clearVisitorLimits(db)
    if (savedPayments) await db.insert(settings).values(savedPayments).onConflictDoNothing()
    await updateShopProfile(db, {
      bankHolder: saved.bankHolder,
      bankName: saved.bankName,
      bankIban: saved.bankIban,
      bankRib: saved.bankRib,
      bankBic: saved.bankBic,
      bankEurHolder: saved.bankEurHolder,
      bankEurName: saved.bankEurName,
      bankEurIban: saved.bankEurIban,
      bankEurBic: saved.bankEurBic,
      bankEurAddress: saved.bankEurAddress,
    })
    await db.delete(orders).where(eq(orders.email, email))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  const items = () => [{ productId, quantity: 1 }]

  test("without an account abroad cannot order, and Tunisia still pays cash on delivery", async () => {
    await setBank({ bankIban: null, bankRib: null })
    expect((await guest.public.catalog.settings()).paymentMethods.transfer).toBe(false)
    await expect(guest.public.orders.create({ ...buyer, items: items() })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
    const tn = await guest.public.orders.create({ ...buyer, country: "TN", currency: "TND", items: items() })
    expect((await guest.public.orders.get({ number: tn.number, token: tn.token })).paymentMethod).toBe("cod")
  })

  test("the old placeholder text does not count as an account", async () => {
    await setBank({ bankIban: "À compléter", bankRib: null })
    expect((await guest.public.catalog.settings()).paymentMethods.transfer).toBe(false)
  })

  test("a complete account is shown on the order and in the email", async () => {
    await setBank({ bankIban: "TN5910006035183598478831", bankRib: "10006035183598478831" })
    expect((await guest.public.catalog.settings()).paymentMethods.transfer).toBe(true)
    const placed = await guest.public.orders.create({ ...buyer, items: items() })
    const order = await guest.public.orders.get({ number: placed.number, token: placed.token })
    expect(order.bank).toMatchObject({ iban: "TN5910006035183598478831", rib: "10006035183598478831" })
    const mail = sent.find((m) => m.to === email && m.text.includes(placed.number))
    expect(mail?.text).toContain("TN5910006035183598478831")
    expect(mail?.text).toContain("RIB: 10006035183598478831")

    await setBank({ bankIban: null, bankRib: null })
    const later = await guest.public.orders.get({ number: placed.number, token: placed.token })
    expect(later.bank).toBeNull()
  })

  test("an euro order shows the euro account, a dinar order the main one", async () => {
    await setBank({ bankIban: "TN5910006035183598478831", bankRib: "10006035183598478831" })
    await updateShopProfile(db, {
      bankEurHolder: "Atelier EUR",
      bankEurName: "Demo Bank AG",
      bankEurIban: "DE89370400440532013000",
      bankEurBic: "DEMODEFF",
      bankEurAddress: "1 Demo Strasse, Berlin",
    })
    const placed = await guest.public.orders.create({ ...buyer, items: items() })
    const eur = await guest.public.orders.get({ number: placed.number, token: placed.token })
    expect(eur.bank).toMatchObject({ iban: "DE89370400440532013000", address: "1 Demo Strasse, Berlin" })
    const mail = sent.find((m) => m.to === email && m.text.includes(placed.number) && m.text.includes("DE89"))
    expect(mail?.text).toContain("DE89370400440532013000")
    expect(mail?.text).toContain("1 Demo Strasse, Berlin")

    await db.update(orders).set({ currency: "TND" }).where(eq(orders.number, placed.number))
    const tnd = await guest.public.orders.get({ number: placed.number, token: placed.token })
    expect(tnd.bank).toMatchObject({ iban: "TN5910006035183598478831" })
  })

  test("without a euro account an euro order keeps the main account", async () => {
    await updateShopProfile(db, {
      bankEurHolder: null,
      bankEurName: null,
      bankEurIban: null,
      bankEurBic: null,
      bankEurAddress: null,
    })
    const placed = await guest.public.orders.create({ ...buyer, items: items() })
    const order = await guest.public.orders.get({ number: placed.number, token: placed.token })
    expect(order.bank).toMatchObject({ iban: "TN5910006035183598478831" })
  })
})
