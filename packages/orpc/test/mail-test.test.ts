import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, mailLog, rateLimits, shopProfile } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import type { Mail } from "../src/lib/mailer"
import { LIMITS } from "../src/lib/rate-limit"
import { getShopProfile } from "../src/lib/shop-profile"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("admin.mail.test", () => {
  const db = createDb(url!)
  const tag = `mailtest-${Date.now()}`
  const sent: Mail[] = []
  const base: Services = {
    db,
    payments: null as never,
    mailer: {
      async send(mail) {
        sent.push(mail)
        return { id: "re_1" }
      },
    },
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2096-05-10T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  let originalNotify: string | null = null
  let owner: ReturnType<typeof clientFor>
  /** Each client is a distinct address, so the rate limit of one test never reaches another. */
  const clientFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(base, headers) })
  const as = (address: string, token: string) =>
    clientFor(new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc", "x-forwarded-for": address }))
  let token = ""

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass"))!.token
    owner = as(`${tag}-0`, token)
    originalNotify = (await getShopProfile(db)).notifyEmail
  })
  afterAll(async () => {
    await db.update(shopProfile).set({ notifyEmail: originalNotify }).where(eq(shopProfile.id, "shop"))
    await db.delete(mailLog).where(like(mailLog.to, `${tag}%`))
    await db.delete(rateLimits).where(like(rateLimits.key, `%${tag}%`))
  })

  test("sends to the notify email, logged as kind test, and the 6th call in a window is refused", async () => {
    const notify = `${tag}-notify@example.test`
    await db.update(shopProfile).set({ notifyEmail: notify }).where(eq(shopProfile.id, "shop"))
    const client = as(`${tag}-1`, token)
    sent.length = 0
    expect(await client.mail.test({})).toEqual({ ok: true, to: notify })
    expect(sent[0]).toMatchObject({ to: notify, subject: "Email de test Ceraghit" })
    const [row] = await db.select().from(mailLog).where(eq(mailLog.to, notify))
    expect(row).toMatchObject({ kind: "test", status: "sent" })
    for (let i = 1; i < LIMITS.mailTest.max; i++) await client.mail.test({})
    await expect(client.mail.test({})).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  test("falls back to the signed-in admin when there is no notify email", async () => {
    await db.update(shopProfile).set({ notifyEmail: null }).where(eq(shopProfile.id, "shop"))
    const res = await as(`${tag}-2`, token).mail.test({})
    expect(res.to).toBe("owner@test.local")
  })

  test("a visitor cannot send a test email", async () => {
    const visitor = clientFor(new Headers({ "x-forwarded-for": `${tag}-3` }))
    await expect(visitor.mail.test({})).rejects.toThrow()
    await expect(visitor.mail.domain({})).rejects.toThrow()
  })

  test("domain state is not_configured without a Resend key and exposes no key", async () => {
    const res = await owner.mail.domain({})
    expect(res.state).toBe("not_configured")
    expect(JSON.stringify(res)).not.toContain("re_")
  })
})
