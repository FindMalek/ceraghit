import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, jobRuns, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { AdminAuth, ConsoleMailer, DemoProvider, type Services } from "@workspace/orpc"
import { eq } from "drizzle-orm"
import { createServer } from "../src/server"

const url = process.env.DATABASE_URL
const SECRET = "x".repeat(32)
const NOW = new Date("2096-05-10T10:00:00Z")

describe.skipIf(!url)("cron endpoints", () => {
  const db = createDb(url!)
  const make = (cronSecret: string | undefined) =>
    createServer({
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
        cronSecret,
      },
    } as Services)
  const server = make(SECRET)
  const call = (path: string, init: { method?: string; bearer?: string } = {}) =>
    server(
      new Request(`https://api.test${path}`, {
        method: init.method ?? "POST",
        headers: init.bearer ? { authorization: `Bearer ${init.bearer}` } : {},
      }),
    )
  const runs = (name: string) => db.select().from(jobRuns).where(eq(jobRuns.name, name))
  const holdNumber = `CER-HOLD-${Date.now()}`

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, {})
    await db.delete(jobRuns)
  })
  afterAll(async () => {
    await db.delete(jobRuns)
    await db.delete(orders).where(eq(orders.number, holdNumber))
  })

  test("a missing or wrong bearer is a 401, a GET, an unknown job or no secret configured is a 404", async () => {
    expect((await call("/cron/release-holds")).status).toBe(401)
    expect((await call("/cron/release-holds", { bearer: "y".repeat(32) })).status).toBe(401)
    expect((await call("/cron/release-holds", { method: "GET", bearer: SECRET })).status).toBe(404)
    expect((await call("/cron/nope", { bearer: SECRET })).status).toBe(404)
    expect((await call("/cron/constructor", { bearer: SECRET })).status).toBe(404)
    const unconfigured = await make(undefined)(
      new Request("https://api.test/cron/release-holds", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    )
    expect(unconfigured.status).toBe(404)
    expect(await runs("release-holds")).toHaveLength(0)
  })

  test("release-holds cancels an expired hold, records each run, and the second run releases nothing", async () => {
    await db.insert(orders).values({
      number: holdNumber,
      publicToken: "t".repeat(24),
      currency: "TND",
      subtotalMinor: 40_000,
      totalMinor: 40_000,
      customerName: "Test",
      email: "t@example.com",
      phone: "+21611111111",
      country: "TN",
      city: "Tunis",
      address: "1 rue du Test",
      paymentMethod: "online",
      createdAt: new Date(NOW.getTime() - 2 * 60 * 60_000),
    })

    const first = await call("/cron/release-holds", { bearer: SECRET })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ ok: true, released: 1 })
    const [order] = await db.select().from(orders).where(eq(orders.number, holdNumber))
    expect(order!.status).toBe("cancelled")

    const second = await call("/cron/release-holds", { bearer: SECRET })
    expect(await second.json()).toEqual({ ok: true, released: 0 })
    const rows = await runs("release-holds")
    expect(rows.map((r) => [r.ok, r.counts])).toEqual([
      [true, { released: 1 }],
      [true, { released: 0 }],
    ])
  })

  test("two calls at once run the job once", async () => {
    await db.delete(jobRuns)
    const bodies = await Promise.all(
      [1, 2].map(async () => (await call("/cron/release-holds", { bearer: SECRET })).json()),
    )
    expect(bodies.filter((b) => b.skipped === "already running")).toHaveLength(1)
    expect(await runs("release-holds")).toHaveLength(1)
  })
})
