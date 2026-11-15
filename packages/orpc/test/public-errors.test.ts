import { expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"
import { clearVisitorLimits, visitorHeaders } from "./fixtures/visitor"

const url = process.env.DATABASE_URL

test.skipIf(!url)("a visitor refused a payment method gets a reason to translate", async () => {
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
  await runMigrations(db)
  const guest = createRouterClient(appRouter, { context: (): Context => createContext(services, visitorHeaders()) })
  await expect(
    guest.public.orders.create({
      currency: "EUR",
      customerName: "Test Buyer",
      email: "errors@example.com",
      phone: "+3220000000",
      country: "BE",
      city: "Bruxelles",
      address: "1 rue du test",
      paymentMethod: "cod",
      items: [{ productId: crypto.randomUUID(), quantity: 1 }],
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", data: { reason: "payment_method_unavailable" } })
  await clearVisitorLimits(db)
  await db.close()
})
