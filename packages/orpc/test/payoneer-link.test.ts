import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, invoices, orderAudit, orders, products, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { DEFAULT_HOLDS, DEFAULT_PAYONEER } from "@workspace/sdk"
import { and, eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { releaseExpiredHolds, settleOrder } from "../src/lib/orders"
import { DemoProvider } from "../src/lib/payments"
import { savePaymentSettings } from "../src/lib/settings"
import { appRouter } from "../src/routers"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("payoneer link", () => {
  const db = createDb(url!)
  const sent: { to: string; subject: string; text: string }[] = []
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async (mail) => void sent.push({ to: mail.to, subject: mail.subject, text: mail.text }) },
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
  const tag = `pl${Date.now()}`
  const email = `${tag}@example.com`
  const buyer = {
    currency: "EUR" as const,
    customerName: "Link Buyer",
    email,
    phone: "+32470000000",
    country: "BE" as const,
    city: "Bruxelles",
    address: "1 rue du test",
    paymentMethod: "payoneer" as const,
  }
  let cookie = ""
  let categoryId = ""
  let productId = ""
  let savedPayments: typeof settings.$inferSelect | undefined

  const client = (headers = visitorHeaders()) =>
    createRouterClient(appRouter, { context: (): Context => createContext(services, headers) })
  const guest = client()
  const owner = () => client(visitorHeaders({ cookie, "x-csrf-token": "orpc" }))
  const place = async () => {
    const placed = await guest.public.orders.create({ ...buyer, items: [{ productId, quantity: 1 }] })
    const row = (await db.query.orders.findFirst({ where: eq(orders.number, placed.number) }))!
    return { placed, id: row.id, get: () => guest.public.orders.get({ number: placed.number, token: placed.token }) }
  }
  const mailsFor = (number: string) => sent.filter((m) => m.to === email && m.subject.includes(number))
  const audits = (orderId: string, action: string) =>
    db
      .select()
      .from(orderAudit)
      .where(and(eq(orderAudit.orderId, orderId), eq(orderAudit.action, action)))

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    ;[savedPayments] = await db.delete(settings).where(eq(settings.key, "payments")).returning()
    await savePaymentSettings(db, {
      methods: { online: false, cod: true, transfer: true, payoneer: true },
      payoneer: DEFAULT_PAYONEER,
      holds: DEFAULT_HOLDS,
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
        title: { fr: "Tasse" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 30,
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
    if (savedPayments) await db.insert(settings).values(savedPayments).onConflictDoNothing()
    const mine = db.select({ id: orders.id }).from(orders).where(eq(orders.email, email))
    await db.delete(invoices).where(inArray(invoices.orderId, mine))
    await db.delete(orders).where(eq(orders.email, email))
    await db.delete(products).where(eq(products.categoryId, categoryId))
    await db.delete(categories).where(eq(categories.id, categoryId))
    await db.close()
  })

  test("the owner sets the link: the customer gets it by email and on the order page, once, with an audit row", async () => {
    const { placed, id, get } = await place()
    const link = "https://link.payoneer.com/pay/abc?token=secret"
    expect(await owner().admin.orders.setPaymentLink({ id, link })).toEqual({ ok: true, emailed: true })

    const [mail, ...more] = mailsFor(placed.number).filter((m) => m.text.includes(link))
    expect(more).toEqual([])
    expect(mail?.subject).toBe(`Votre lien de paiement pour la commande ${placed.number}`)
    expect(mail?.text).toContain("Total: 84,5")
    expect((await get()).payoneer).toMatchObject({ link, waitingForLink: false })
    const [audit] = await audits(id, "payment_link_set")
    expect(audit).toMatchObject({ reference: "link.payoneer.com/pay/abc", fromStatus: "pending_payment" })

    const shown = await owner().admin.orders.get({ id })
    expect(shown).toMatchObject({ paymentLink: link, paymentRef: null })
    expect(shown.paymentLinkSetAt).not.toBeNull()

    const before = sent.length
    expect(await owner().admin.orders.setPaymentLink({ id, link })).toEqual({ ok: true, emailed: false })
    expect(sent.length).toBe(before)
    expect(await audits(id, "payment_link_set")).toHaveLength(1)

    const next = "https://link.payoneer.com/pay/def"
    await owner().admin.orders.setPaymentLink({ id, link: next })
    expect(mailsFor(placed.number).filter((m) => m.text.includes(next))).toHaveLength(1)
    expect(await audits(id, "payment_link_set")).toHaveLength(2)
  })

  test("only payoneer.com links on a pending payoneer order, and a link is never reused", async () => {
    const a = await place()
    const b = await place()
    for (const link of ["https://payoneer.com.evil.tld/x", "http://payoneer.com/x", "javascript:alert(1)"]) {
      await expect(owner().admin.orders.setPaymentLink({ id: a.id, link })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
    }
    const link = "https://payoneer.com/pay/shared"
    await owner().admin.orders.setPaymentLink({ id: a.id, link })
    await expect(owner().admin.orders.setPaymentLink({ id: b.id, link })).rejects.toMatchObject({ code: "CONFLICT" })

    await db.update(orders).set({ paymentMethod: "transfer" }).where(eq(orders.id, b.id))
    await expect(
      owner().admin.orders.setPaymentLink({ id: b.id, link: "https://payoneer.com/pay/other" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await db.update(orders).set({ paymentMethod: "payoneer", status: "paid" }).where(eq(orders.id, b.id))
    await expect(
      owner().admin.orders.setPaymentLink({ id: b.id, link: "https://payoneer.com/pay/other" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      client(visitorHeaders({ "x-csrf-token": "orpc" })).admin.orders.setPaymentLink({ id: a.id, link }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  test("a payoneer order only becomes paid through markPaidManually, whatever the request says", async () => {
    const { id, get } = await place()
    const link = "https://link.payoneer.com/pay/guarded"
    await owner().admin.orders.setPaymentLink({ id, link })
    expect(await settleOrder(services, link)).toBeNull()
    expect((await get()).status).toBe("pending_payment")
    expect((await db.query.orders.findFirst({ where: eq(orders.id, id) }))?.status).toBe("pending_payment")
    expect(
      await owner().admin.orders.markPaidManually({
        id,
        method: "payoneer",
        reference: "R1",
        note: null,
        totalMinor: (await owner().admin.orders.get({ id })).totalMinor,
        currency: "EUR",
      }),
    ).toEqual({ status: "paid", alreadyPaid: false })
  })

  test("an unpaid payoneer order is released after the hold, pieces back", async () => {
    const { id } = await place()
    const stock = async () => (await db.query.products.findFirst({ where: eq(products.id, productId) }))!.stock
    const held = await stock()
    const later = new Date(Date.now() + 8 * 864e5)
    expect(await releaseExpiredHolds(services, new Date(), { only: [id] })).toBe(0)
    expect(await releaseExpiredHolds(services, later, { only: [id] })).toBe(1)
    expect(await releaseExpiredHolds(services, later, { only: [id] })).toBe(0)
    expect((await db.query.orders.findFirst({ where: eq(orders.id, id) }))?.status).toBe("cancelled")
    expect(await stock()).toBe(held + 1)
    expect(await audits(id, "hold_expired")).toHaveLength(1)
  })
})
