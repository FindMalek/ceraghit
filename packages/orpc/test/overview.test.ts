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

/** A fixed clock, studio time (UTC+1): every sale below is dated from it, so the test reads the same at any hour. */
const TODAY = "2026-03-10"
let clock = new Date(`${TODAY}T10:00:00+01:00`)
const dayOffset = (daysAgo: number): string => new Date(Date.UTC(2026, 2, 10 - daysAgo)).toISOString().slice(0, 10)
const studio = (daysAgo: number, time: string): string => `${dayOffset(daysAgo)}T${time}:00+01:00`

describe.skipIf(!url)("overview stats", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => ({ id: null }) },
    storage: null,
    auth: new AdminAuth(db),
    now: () => clock,
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

  const sale = (
    paidAt: string | null,
    currency: "TND" | "EUR",
    totalMinor: number,
    status: "paid" | "cancelled" | "pending_payment" = "paid",
    paymentMethod = "online",
  ) =>
    db.insert(orders).values({
      paymentMethod,
      number: `TST-OV-${seq++}`,
      publicToken: "t",
      status,
      currency,
      subtotalMinor: totalMinor,
      totalMinor,
      paidAt: paidAt ? new Date(paidAt) : null,
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
    clock = new Date(`${TODAY}T10:00:00+01:00`)
    const before = await owner.overview({ days: 7 })
    const monthBefore = await owner.overview({ days: 30 })

    await sale(studio(7, "23:30"), "TND", 40_000)
    await sale(studio(6, "00:10"), "TND", 85_500)
    await sale(studio(3, "12:00"), "EUR", 5_900)
    await sale(studio(3, "12:00"), "TND", 99_000, "cancelled")

    const week = await owner.overview({ days: 7 })
    expect(week.revenue.TND - before.revenue.TND).toBe(85_500)
    expect(week.revenue.EUR - before.revenue.EUR).toBe(5_900)
    expect(week.paidOrders - before.paidOrders).toBe(2)

    const month = await owner.overview({ days: 30 })
    expect(month.revenue.TND - monthBefore.revenue.TND).toBe(125_500)
    expect(month.revenue.EUR - monthBefore.revenue.EUR).toBe(5_900)
  })

  test("a range ends at the studio midnight: a sale just before it counts, one just after does not", async () => {
    clock = new Date(`${TODAY}T23:50:00+01:00`)
    const before = await owner.overview({ days: 7 })

    await sale(studio(0, "23:45"), "TND", 30_000)
    await sale(studio(-1, "00:10"), "TND", 9_000)

    const week = await owner.overview({ days: 7 })
    expect(week.revenue.TND - before.revenue.TND).toBe(30_000)
    expect(week.paidOrders - before.paidOrders).toBe(1)
  })

  test("a Payoneer order counts in euros only once the owner confirmed it, never while pending", async () => {
    clock = new Date(`${TODAY}T10:00:00+01:00`)
    const before = await owner.overview({ days: 7 })
    await sale(null, "EUR", 12_000, "pending_payment", "payoneer")
    const pending = await owner.overview({ days: 7 })
    expect(pending.revenue).toEqual(before.revenue)
    expect(pending.paidOrders).toBe(before.paidOrders)
    expect(pending.pendingOrders - before.pendingOrders).toBe(1)

    await sale(studio(1, "12:00"), "EUR", 12_000, "paid", "payoneer")
    const paid = await owner.overview({ days: 7 })
    expect(paid.revenue.EUR - before.revenue.EUR).toBe(12_000)
    expect(paid.revenue.TND).toBe(before.revenue.TND)
  })
})
