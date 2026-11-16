import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, invoiceCounters, invoices, mailLog, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { and, eq, inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { type ConfirmationOrder, renderShipped } from "../src/emails/confirmation"
import { EMAIL_COPY } from "../src/emails/copy"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL
const LRI = "⁦"
const ctx = { webUrl: "https://web.test", bank: null, contactEmail: "contact@studio.test", studio: null }
const mailOrder = (locale: string, over: Partial<ConfirmationOrder> = {}): ConfirmationOrder => ({
  number: "CG-1001",
  currency: "EUR",
  subtotalMinor: 2400,
  shippingMinor: 900,
  totalMinor: 3300,
  items: [{ ref: "V-10", title: "Vase", quantity: 2, unitMinor: 1200 }],
  locale,
  publicToken: "tok",
  email: "buyer@example.com",
  customerName: "Test Buyer",
  phone: "+32470000000",
  address: "1 rue du test",
  postalCode: null,
  city: "Bruxelles",
  country: "BE",
  note: null,
  paymentMethod: "online",
  ...over,
})
const aramex = {
  carrier: "aramex" as const,
  carrierName: null,
  trackingNumber: "12345678901",
  trackingUrl: "https://www.aramex.com/track/results?ShipmentNumber=12345678901",
}

describe("shipped mail", () => {
  test.each(["fr", "en", "ar"] as const)(
    "%s mail has its own subject, carrier, number, tracking and order link",
    async (locale) => {
      const { text, html, subject, to } = await renderShipped(mailOrder(locale), aramex, ctx)
      expect(to).toBe("buyer@example.com")
      expect(subject).toBe(EMAIL_COPY[locale].shipped.subject("CG-1001"))
      expect(subject).not.toBe(EMAIL_COPY[locale].paymentReceived.subject("CG-1001"))
      expect(subject).not.toBe(EMAIL_COPY[locale].confirmation.subject("CG-1001"))
      for (const body of [text, html]) {
        expect(body).toContain("Aramex")
        expect(body).toContain("12345678901")
        expect(body).toContain(aramex.trackingUrl.replace("&", body === html ? "&amp;" : "&"))
        expect(body).toContain(`https://web.test/${locale}/order/CG-1001?t=tok`)
      }
      expect(html).toContain(`href="${aramex.trackingUrl}"`)
      expect(text).not.toContain(EMAIL_COPY[locale].shipped.noTracking)
      if (locale === "ar") {
        expect(text).toContain(`${LRI}12345678901`)
        expect(text).toContain(`${LRI}${aramex.trackingUrl}`)
      }
    },
  )

  test("no tracking: fallback sentence and no empty tracking lines; carrier printed as typed", async () => {
    const { text, html } = await renderShipped(
      mailOrder("fr"),
      { carrier: "other", carrierName: "Livraison en main propre", trackingNumber: null, trackingUrl: null },
      ctx,
    )
    const k = EMAIL_COPY.fr.shipped
    expect(text).toContain("Livraison en main propre")
    expect(text).toContain(k.noTracking)
    expect(html).toContain(k.noTracking)
    expect(text).not.toContain(k.trackingNumber)
    expect(text).not.toContain(k.track)
    expect(text).not.toMatch(/: *$/m)
  })

  test("cash on delivery adds the total in the order currency, prepaid orders do not", async () => {
    const cod = await renderShipped(
      mailOrder("fr", { paymentMethod: "cod", currency: "TND", totalMinor: 120_000 }),
      aramex,
      ctx,
    )
    expect(cod.text).toMatch(/Prévoyez .*120.* en espèces à la livraison/)
    expect(cod.html).toContain("en espèces à la livraison")
    const paid = await renderShipped(mailOrder("fr"), aramex, ctx)
    expect(paid.text).not.toContain("en espèces")
  })

  test("the mail carries no phone or address", async () => {
    const { text, html } = await renderShipped(mailOrder("en"), aramex, ctx)
    for (const pii of ["+32470000000", "1 rue du test"]) {
      expect(text).not.toContain(pii)
      expect(html).not.toContain(pii)
    }
  })
})

describe.skipIf(!url)("shipped mail on shipping", () => {
  const db = createDb(url!)
  const sent: { to: string; subject: string; text: string }[] = []
  let failMail = false
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: {
      send: async (m) => {
        if (failMail) throw new Error("smtp down")
        sent.push({ to: m.to, subject: m.subject, text: m.text })
        return undefined
      },
    },
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2095-03-10T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const tag = `${Date.now()}`
  const clientFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(services, headers) })
  let owner: ReturnType<typeof clientFor>
  let seq = 0

  const order = async (over: Partial<typeof orders.$inferInsert> = {}) => {
    const n = seq++
    const [row] = await db
      .insert(orders)
      .values({
        number: `TST-SM-${tag}-${n}`,
        publicToken: `tok-${tag}-${n}`,
        status: "paid",
        paidAt: services.now(),
        paymentMethod: "online",
        currency: "EUR",
        subtotalMinor: 2_400,
        totalMinor: 2_400,
        customerName: "Test Buyer",
        email: `sm-${tag}-${n}@example.test`,
        phone: "+32470000000",
        country: "BE",
        city: "Bruxelles",
        address: "1 rue du test",
        locale: "en",
        ...over,
      })
      .returning()
    return row!
  }
  const logs = (id: string) =>
    db
      .select()
      .from(mailLog)
      .where(and(eq(mailLog.orderId, id), eq(mailLog.kind, "shipped")))

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login(
      visitorHeaders().get("x-forwarded-for")!,
      "owner@test.local",
      "clay-test-pass",
    )
    const headers = new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })
    owner = clientFor(headers)
  })

  afterAll(async () => {
    const mine = await db
      .select({ id: orders.id })
      .from(orders)
      .where(like(orders.number, `TST-SM-${tag}-%`))
    const ids = mine.map((o) => o.id)
    if (ids.length) {
      await db.delete(mailLog).where(inArray(mailLog.orderId, ids))
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.delete(invoiceCounters).where(eq(invoiceCounters.year, 2095))
    await clearVisitorLimits(db)
  })

  test("shipping sends one mail in the order language and logs it, a second click or a tracking edit sends none", async () => {
    sent.length = 0
    const o = await order({ locale: "fr" })
    await owner.orders.markShipped({ id: o.id, carrier: "aramex", trackingNumber: "777" })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe(o.email)
    expect(sent[0]!.subject).toBe(EMAIL_COPY.fr.shipped.subject(o.number))
    expect(sent[0]!.text).toContain("ShipmentNumber=777")
    expect(sent[0]!.text).toContain(`https://web.test/fr/order/${o.number}?t=${o.publicToken}`)
    expect((await logs(o.id)).map((l) => l.status)).toEqual(["sent"])

    await owner.orders.markShipped({ id: o.id, carrier: "aramex", trackingNumber: "777" }).catch(() => undefined)
    await owner.orders.updateTracking({ id: o.id, carrier: "aramex", trackingNumber: "888" })
    expect(sent).toHaveLength(1)
    expect(await logs(o.id)).toHaveLength(1)
  })

  test("a mail failure is logged for resend and never fails the shipment", async () => {
    const o = await order()
    failMail = true
    const spy = console.error
    console.error = () => {}
    try {
      expect(await owner.orders.markShipped({ id: o.id, carrier: "dhl" })).toEqual({ ok: true })
    } finally {
      console.error = spy
      failMail = false
    }
    expect((await db.select().from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe("fulfilled")
    const rows = await logs(o.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 1 })
  })

  test("an order shipped before tracking existed (no shippedAt) still renders", async () => {
    const o = await order({ status: "fulfilled", carrier: "dhl", shippedAt: null })
    const mail = await renderShipped(
      mailOrder("en"),
      { carrier: "dhl", carrierName: null, trackingNumber: null, trackingUrl: null },
      ctx,
    )
    expect(mail.text).toContain("DHL Express")
    expect(o.shippedAt).toBeNull()
  })
})
