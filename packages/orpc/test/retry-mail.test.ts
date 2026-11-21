import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, mailLog } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { retryFailedMails } from "../src/lib/mail-log"
import { type Mail, MailError, type Mailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("retry-mail", () => {
  const db = createDb(url!)
  const tag = `retry-${Date.now()}`
  const sent: Mail[] = []
  let down = true
  const mailer: Mailer = {
    async send(mail) {
      // rows other test files left failed in the shared database always go out, so they never clog the queue
      if (mail.to.startsWith(tag)) {
        sent.push(mail)
        if (down) throw new MailError("resend 503: down", true, 503)
      }
      return { id: "re_1" }
    },
  }
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer,
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    sleep: async () => undefined,
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const failed = (name: string, over: Partial<typeof mailLog.$inferInsert> = {}) =>
    db.insert(mailLog).values({
      kind: "test",
      to: `${tag}-${name}@example.test`,
      subject: name,
      text: "hello",
      status: "failed",
      error: "resend 503: down",
      attempts: 3,
      ...over,
    })
  const statusOf = async (name: string) =>
    (
      await db
        .select()
        .from(mailLog)
        .where(eq(mailLog.to, `${tag}-${name}@example.test`))
    )[0]!

  beforeAll(async () => {
    await runMigrations(db)
    await failed("fresh")
    await failed("old", { createdAt: new Date(Date.now() - 3 * 864e5) })
    await failed("exhausted", { attempts: 7 })
  })
  afterAll(async () => {
    await db.delete(mailLog).where(like(mailLog.to, `${tag}-%`))
  })

  test("resends recent failures once the provider is back, skips stale or over-budget ones, and is a no-op after", async () => {
    await retryFailedMails(services)
    expect((await statusOf("fresh")).status).toBe("failed")
    const fresh = await statusOf("fresh")
    expect(fresh.attempts).toBe(6)

    down = false
    sent.length = 0
    await retryFailedMails(services)
    expect(sent.map((m) => m.subject)).toEqual(["fresh"])
    expect((await statusOf("fresh")).status).toBe("resent")
    expect((await statusOf("old")).status).toBe("failed")
    // 7 recorded attempts plus the 3 of one resend would pass the cap of 9
    expect((await statusOf("exhausted")).status).toBe("failed")
    expect((await statusOf("exhausted")).attempts).toBe(7)

    sent.length = 0
    await retryFailedMails(services)
    expect(sent).toEqual([])
  })

  test("every attempt on one failed row carries the same idempotency key, so a lost reply cannot send it twice", async () => {
    down = true
    await failed("keyed")
    const row = await statusOf("keyed")
    sent.length = 0
    await retryFailedMails(services)
    down = false
    await retryFailedMails(services)
    const keys = new Set(sent.filter((m) => m.subject === "keyed").map((m) => m.idempotencyKey))
    expect([...keys]).toEqual([row.id])
  })
})
