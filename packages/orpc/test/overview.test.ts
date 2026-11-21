import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("overview stats", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => ({ id: null }) },
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
  const clientFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(services, headers) })
  let owner: ReturnType<typeof clientFor>
  let seq = 0

  const sale = (paidAt: string, currency: "TND" | "EUR", totalMinor: number, status: "paid" | "cancelled" = "paid") =>
    db.insert(orders).values({
      number: `TST-OV-${seq++}`,
      publicToken: "t",
      status,
      currency,
      subtotalMinor: totalMinor,
      totalMinor,
      paidAt: new Date(paidAt),
      customerName: "Test",
      email: "ov@example.test",
      phone: "20000000",
      country: "TN",
      city: "Tunis",
      address: "1 rue Test",
    })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" })
    owner = clientFor(headers)
  })

  afterAll(async () => {
    await db.delete(orders).where(like(orders.number, "TST-OV-%"))
  })

  test("a range starts at the studio midnight, not 24 hours times days before now", async () => {
    const day = (ago: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(Date.now() - ago * 864e5)
    const before = await owner.overview({ days: 7 })
    const monthBefore = await owner.overview({ days: 30 })

    await sale(`${day(7)}T23:30:00+01:00`, "TND", 40_000)
    await sale(`${day(6)}T00:10:00+01:00`, "TND", 85_500)
    await sale(`${day(3)}T12:00:00+01:00`, "EUR", 5_900)
    await sale(`${day(3)}T12:00:00+01:00`, "TND", 99_000, "cancelled")

    const week = await owner.overview({ days: 7 })
    expect(week.revenue.TND - before.revenue.TND).toBe(85_500)
    expect(week.revenue.EUR - before.revenue.EUR).toBe(5_900)
    expect(week.paidOrders - before.paidOrders).toBe(2)

    const month = await owner.overview({ days: 30 })
    expect(month.revenue.TND - monthBefore.revenue.TND).toBe(125_500)
    expect(month.revenue.EUR - monthBefore.revenue.EUR).toBe(5_900)
  })
})
