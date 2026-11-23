import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, jobRuns } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { setReporter } from "@workspace/errors"
import { JOBS } from "@workspace/sdk"
import { inArray } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { runJob } from "../src/lib/jobs"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL

const NAMES = JOBS.map((j) => j.name)

describe.skipIf(!url)("jobs", () => {
  const db = createDb(url!)
  let clock = new Date("2096-05-10T10:00:00Z")
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
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
      cronJobs: ["cleanup-uploads", "release-holds"],
    },
  }
  const client = (headers: Headers) =>
    createRouterClient(appRouter, { context: (): Context => createContext(services, headers) })
  let owner: ReturnType<typeof client>
  const status = async () => (await owner.admin.jobs.status({})).items
  const holds = async () => (await status()).find((j) => j.name === "release-holds")!

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    await db.delete(jobRuns).where(inArray(jobRuns.name, NAMES))
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    owner = client(new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }))
  })
  afterAll(async () => {
    await db.delete(jobRuns).where(inArray(jobRuns.name, NAMES))
  })

  test("a visitor cannot read the job status", async () => {
    await expect(client(new Headers({ "x-csrf-token": "orpc" })).admin.jobs.status({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  test("a job that never ran is not stale, and one without a handler is not registered", async () => {
    const items = await status()
    expect(items.find((j) => j.name === "release-holds")).toMatchObject({
      lastRun: null,
      stale: false,
      registered: true,
    })
    expect(items.find((j) => j.name === "retry-mail")).toMatchObject({ registered: false })
  })

  test("a run is stale after the job's threshold: fresh at 119 minutes, stale at 121", async () => {
    await runJob(services, "release-holds", async () => ({ released: 2 }))
    clock = new Date(clock.getTime() + 119 * 60_000)
    expect(await holds()).toMatchObject({
      stale: false,
      minutesSince: 119,
      lastRun: { ok: true, counts: { released: 2 } },
    })
    clock = new Date(clock.getTime() + 2 * 60_000)
    expect(await holds()).toMatchObject({ stale: true })
  })

  test("a failing job stores a short message without the stack and answers ok false", async () => {
    const outcome = await runJob(services, "release-holds", async () => {
      throw new Error("boom\n    at secret.ts:1")
    })
    expect(outcome).toEqual({ ok: false })
    expect((await holds()).lastRun).toMatchObject({ ok: false, error: "boom" })
  })

  test("a failed run is reported to GlitchTip with its job name and nothing else", async () => {
    const seen: { tags: Record<string, string> }[] = []
    setReporter((_error, context) => {
      seen.push(context)
      return "evt"
    })
    try {
      await runJob(services, "release-holds", async () => {
        throw new Error("boom")
      })
      await runJob(services, "release-holds", async () => ({ released: 1 }))
    } finally {
      setReporter(null)
    }
    expect(seen).toHaveLength(1)
    expect(seen[0]?.tags).toEqual({ job: "release-holds" })
  })

  test("runs older than 90 days are deleted at the end of a run", async () => {
    await db.delete(jobRuns).where(inArray(jobRuns.name, NAMES))
    await db.insert(jobRuns).values({ name: "release-holds", startedAt: new Date(clock.getTime() - 91 * 864e5) })
    await runJob(services, "release-holds", async () => ({}))
    expect(await db.select().from(jobRuns).where(inArray(jobRuns.name, NAMES))).toHaveLength(1)
  })
})
