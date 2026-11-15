import { expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, invoiceCounters, invoices, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL
const PREFIX = "TST-PINV-"
const NOW = new Date("2095-06-01T10:00:00Z")

test.skipIf(!url)("a customer gets the invoice of a paid order only with its token", async () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => NOW,
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  await runMigrations(db)
  const guest = createRouterClient(appRouter, {
    context: (): Context => createContext(services, new Headers({ "x-forwarded-for": "10.9.9.9" })),
  })
  const base = {
    publicToken: "secret-token",
    currency: "TND" as const,
    subtotalMinor: 1000,
    totalMinor: 1000,
    customerName: "Test",
    email: "client@example.test",
    phone: "20000000",
    country: "TN",
    city: "Tunis",
    address: "1 rue Test",
    locale: "ar",
  }
  const [paid, pending] = await db
    .insert(orders)
    .values([
      { ...base, number: `${PREFIX}PAID`, status: "paid" },
      { ...base, number: `${PREFIX}PEND`, status: "pending_payment" },
    ])
    .returning()

  const wrong = guest.public.orders.invoice({ number: paid!.number, token: "nope" })
  await expect(wrong).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(guest.public.orders.invoice({ number: pending!.number, token: "secret-token" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  })

  const view = await guest.public.orders.invoice({ number: paid!.number, token: "secret-token" })
  expect(view.number).toMatch(/^2095-\d{4}$/)
  expect(view.locale).toBe("ar")
  const json = JSON.stringify(view)
  for (const leak of ["notifyEmail", "paymentRef", "paymentProvider"]) expect(json).not.toContain(leak)

  const ids = (
    await db
      .select({ id: orders.id })
      .from(orders)
      .where(like(orders.number, `${PREFIX}%`))
  ).map((o) => o.id)
  await db.delete(invoices).where(inArray(invoices.orderId, ids))
  await db.delete(invoiceCounters).where(inArray(invoiceCounters.year, [2095]))
  await db.delete(orders).where(like(orders.number, `${PREFIX}%`))
  await db.close()
})
