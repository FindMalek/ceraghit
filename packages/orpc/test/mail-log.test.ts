import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { categories, createDb, mailLog, orders, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { deliverMail, purgeMailLog } from "../src/lib/mail-log"
import { type Mail, MailError, type Mailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"
import { publicRouter } from "../src/routers/public"

const url = process.env.DATABASE_URL

/** Answers each send with the next outcome: an error to throw, or "ok". */
function scripted(outcomes: (MailError | "ok")[]) {
  const sent: Mail[] = []
  const mailer: Mailer = {
    async send(mail) {
      sent.push(mail)
      const next = outcomes.shift() ?? "ok"
      if (next !== "ok") throw next
      return { id: "re_123" }
    },
  }
  return { sent, mailer }
}

describe.skipIf(!url)("mail log", () => {
  const db = createDb(url!)
  const waits: number[] = []
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: scripted([]).mailer,
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2096-05-10T10:00:00Z"),
    sleep: async (ms) => void waits.push(ms),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const tag = `mail-log-${Date.now()}`
  const mail = (n: number): Mail => ({ to: `${tag}-${n}@example.test`, subject: `${tag} ${n}`, text: "corps" })
  const rows = (n: number) =>
    db
      .select()
      .from(mailLog)
      .where(eq(mailLog.subject, `${tag} ${n}`))
  let owner: ReturnType<typeof ownerFor>
  const ownerFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(base, headers) })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await base.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    owner = ownerFor(new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }))
  })
  afterAll(async () => {
    await db.delete(mailLog).where(inArray(mailLog.kind, ["test"]))
  })

  test("a 503 then success is one sent row with two attempts and a pause in between", async () => {
    waits.length = 0
    const { mailer } = scripted([new MailError("resend 503: down", true, 503), "ok"])
    expect(await deliverMail({ ...base, mailer }, "test", mail(1))).toBe(true)
    const [row] = await rows(1)
    expect(row).toMatchObject({ status: "sent", attempts: 2, providerId: "re_123", error: null })
    expect(waits).toEqual([1000])
  })

  test("three 429 leave a failed row, waiting as long as the provider asks", async () => {
    waits.length = 0
    const limited = () => new MailError("resend 429: slow down", true, 429, 3000)
    const { mailer, sent } = scripted([limited(), limited(), limited()])
    expect(await deliverMail({ ...base, mailer }, "test", mail(2))).toBe(false)
    const [row] = await rows(2)
    expect(row).toMatchObject({ status: "failed", attempts: 3, error: "resend 429: slow down" })
    expect(sent).toHaveLength(3)
    expect(waits).toEqual([3000, 3000])
  })

  test("a 422 is not retried", async () => {
    const { mailer, sent } = scripted([new MailError("resend 422: bad address", false, 422)])
    expect(await deliverMail({ ...base, mailer }, "test", mail(3))).toBe(false)
    expect(sent).toHaveLength(1)
    expect((await rows(3))[0]).toMatchObject({ status: "failed", attempts: 1 })
  })

  test("an order is still created when its mails fail for good", async () => {
    const email = `${tag}@example.test`
    const [cat] = await db
      .insert(categories)
      .values({ slug: tag, name: { fr: "Test" } })
      .returning()
    const [product] = await db
      .insert(products)
      .values({
        ref: tag,
        slug: tag,
        categoryId: cat!.id,
        title: { fr: "Mug" },
        priceTnd: 40_000,
        priceEur: 1_200,
        stock: 5,
        status: "published",
      })
      .returning()
    const refused = () => new MailError("resend 403: domain not verified", false, 403)
    const { mailer } = scripted([refused(), refused()])
    const visitor = createRouterClient(publicRouter, {
      context: (): Context => createContext({ ...base, mailer }, new Headers()),
    })
    const created = await visitor.orders.create({
      currency: "TND",
      customerName: "Mail Test",
      email,
      phone: "+21620000000",
      country: "TN",
      city: "Tunis",
      address: "1 rue du test",
      paymentMethod: "cod",
      items: [{ productId: product!.id, quantity: 1 }],
    })
    const [order] = await db.select().from(orders).where(eq(orders.number, created.number))
    expect(order?.status).toBe("pending_payment")
    const log = await db.select().from(mailLog).where(eq(mailLog.orderId, order!.id))
    expect(log.map((r) => [r.kind, r.status])).toEqual([
      ["order_confirmation", "failed"],
      ["order_studio", "failed"],
    ])
    await db.delete(orders).where(eq(orders.id, order!.id))
    await db.delete(products).where(eq(products.id, product!.id))
    await db.delete(categories).where(eq(categories.id, cat!.id))
  })

  test("resend sends the stored mail again, closes the old row and clears the failure list", async () => {
    const failing = scripted([new MailError("resend 403: domain", false, 403)])
    await deliverMail({ ...base, mailer: failing.mailer }, "test", mail(4))
    const [failed] = await rows(4)
    const before = await owner.mail.failures({})
    expect(before.items.map((i) => i.id)).toContain(failed!.id)

    const working = scripted([])
    const session = await base.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const client = createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(
          { ...base, mailer: working.mailer },
          new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }),
        ),
    })
    expect(await client.mail.resend({ id: failed!.id })).toEqual({ ok: true })
    expect(working.sent).toEqual([{ to: failed!.to, subject: failed!.subject, text: "corps", replyTo: undefined }])
    expect((await rows(4)).map((r) => r.status).sort()).toEqual(["resent", "sent"])
    expect((await owner.mail.failures({})).items.map((i) => i.id)).not.toContain(failed!.id)
    await expect(client.mail.resend({ id: failed!.id })).rejects.toThrow("Email introuvable.")
  })

  test("dismiss closes a failure without sending", async () => {
    await deliverMail({ ...base, mailer: scripted([new MailError("x", false, 401)]).mailer }, "test", mail(5))
    const [failed] = await rows(5)
    expect(await owner.mail.dismiss({ id: failed!.id })).toEqual({ ok: true })
    expect((await rows(5))[0]?.status).toBe("resent")
  })

  test("purge removes rows older than 90 days only", async () => {
    await deliverMail(base, "test", mail(6))
    await db
      .update(mailLog)
      .set({ createdAt: new Date("2096-01-01T00:00:00Z") })
      .where(eq(mailLog.subject, `${tag} 6`))
    await deliverMail(base, "test", mail(7))
    await db
      .update(mailLog)
      .set({ createdAt: new Date("2096-05-01T00:00:00Z") })
      .where(eq(mailLog.subject, `${tag} 7`))
    await purgeMailLog(base)
    expect(await rows(6)).toHaveLength(0)
    expect(await rows(7)).toHaveLength(1)
  })

  test("a visitor cannot reach admin.mail", async () => {
    const visitor = createRouterClient(adminRouter, { context: (): Context => createContext(base, new Headers()) })
    await expect(visitor.mail.failures({})).rejects.toThrow()
  })
})
