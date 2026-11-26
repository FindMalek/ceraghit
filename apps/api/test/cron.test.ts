import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, jobRuns, orderAudit, orders } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { AdminAuth, ConsoleMailer, DemoProvider, type Services } from "@workspace/orpc"
import { and, count, eq, lt, sql } from "drizzle-orm"
import { CRON_JOBS, type CronJob } from "../src/cron"
import { createServer } from "../src/server"

const url = process.env.DATABASE_URL
const SECRET = "x".repeat(32)
const JOB = `test-holds-${Date.now()}`

describe.skipIf(!url)("cron endpoints", () => {
  const db = createDb(url!)

  beforeAll(() => runMigrations(db))
  const make = (
    cronSecret: string | undefined,
    jobs: Record<string, CronJob> = { [JOB]: CRON_JOBS["release-holds"]! },
    hooks?: Services["hooks"],
  ) =>
    createServer(
      {
        db,
        payments: new DemoProvider("https://web.test"),
        mailer: new ConsoleMailer(),
        storage: null,
        auth: new AdminAuth(db),
        hooks,
        now: () => new Date(),
        config: {
          webUrl: "https://web.test",
          apiPublicUrl: "https://api.test",
          appEnv: "local",
          deployEnv: "test",
          secureCookies: false,
          onlinePayments: true,
          cronSecret,
        },
      } as Services,
      jobs,
    )
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

  afterAll(async () => {
    await db.delete(jobRuns).where(eq(jobRuns.name, JOB))
    await db.delete(orders).where(eq(orders.number, holdNumber))
  })

  test("a missing or wrong bearer is a 401, a GET, an unknown job or no secret configured is a 404", async () => {
    expect((await call(`/cron/${JOB}`)).status).toBe(401)
    expect((await call(`/cron/${JOB}`, { bearer: "y".repeat(32) })).status).toBe(401)
    expect((await call(`/cron/${JOB}`, { method: "GET", bearer: SECRET })).status).toBe(404)
    expect((await call("/cron/nope", { bearer: SECRET })).status).toBe(404)
    expect((await call("/cron/constructor", { bearer: SECRET })).status).toBe(404)
    const unconfigured = await make(undefined)(
      new Request(`https://api.test/cron/${JOB}`, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    )
    expect(unconfigured.status).toBe(404)
    expect(await runs(JOB)).toHaveLength(0)
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
      createdAt: new Date(Date.now() - 2 * 60 * 60_000),
    })

    const [{ expired = 0 } = {}] = await db
      .select({ expired: count() })
      .from(orders)
      .where(
        and(
          eq(orders.status, "pending_payment"),
          eq(orders.paymentMethod, "online"),
          lt(orders.createdAt, new Date(Date.now() - 45 * 60_000)),
        ),
      )
    expect(expired).toBeGreaterThanOrEqual(1)
    // the job also mails customers of already released orders that have no mail yet (none for the online fixture)
    const [{ unmailed = 0 } = {}] = await db
      .select({ unmailed: count() })
      .from(orderAudit)
      .where(
        and(
          eq(orderAudit.action, "hold_expired"),
          sql`not exists (select 1 from mail_log m where m.order_id = ${orderAudit.orderId} and m.kind = 'order_expired')`,
        ),
      )
    const mailed = Math.min(unmailed, 50)

    let changes = 0
    const announcing = make(SECRET, undefined, { catalogChanged: async () => void changes++ })
    const run = () =>
      announcing(
        new Request(`https://api.test/cron/${JOB}`, {
          method: "POST",
          headers: { authorization: `Bearer ${SECRET}` },
        }),
      )
    const first = await run()
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ ok: true, released: expired, mailed })
    const [order] = await db.select().from(orders).where(eq(orders.number, holdNumber))
    expect(order!.status).toBe("cancelled")

    expect(changes).toBe(1)
    const second = await run()
    expect(await second.json()).toEqual({ ok: true, released: 0, mailed: 0 })
    // nothing released, so the storefront keeps its cache
    expect(changes).toBe(1)
    const rows = await runs(JOB)
    expect(rows.map((r) => [r.ok, r.counts])).toEqual([
      [true, { released: expired, mailed }],
      [true, { released: 0, mailed: 0 }],
    ])
  })

  test("track-shipments is a safe no-op while shipping is manual, and the run is recorded", async () => {
    const res = await make(
      SECRET,
      CRON_JOBS,
    )(
      new Request("https://api.test/cron/track-shipments", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: "manual shipping" })
    expect((await runs("track-shipments")).at(-1)?.ok).toBe(true)
    await db.delete(jobRuns).where(eq(jobRuns.name, "track-shipments"))
  })

  test("two calls at once run the job once", async () => {
    await db.delete(jobRuns).where(eq(jobRuns.name, JOB))
    const bodies = await Promise.all([1, 2].map(async () => (await call(`/cron/${JOB}`, { bearer: SECRET })).json()))
    expect(bodies.filter((b) => b.skipped === "already running")).toHaveLength(1)
    expect(await runs(JOB)).toHaveLength(1)
  })
})
