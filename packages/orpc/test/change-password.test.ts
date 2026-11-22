import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { adminSessions, admins, createDb, rateLimits, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { LIMITS } from "../src/lib/rate-limit"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("admin.account.changePassword", () => {
  const db = createDb(url!)
  const email = `pw-${Date.now()}@test.local`
  const OLD = "clay-test-pass-old"
  const NEW = "a much longer new passphrase"
  const services = {
    db,
    payments: null as never,
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: { webUrl: "https://web.test", apiPublicUrl: "https://api.test", appEnv: "local", deployEnv: "test" },
  } as unknown as Services
  const client = (token: string) =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ "x-csrf-token": "orpc", cookie: `ceraghit_admin=${token}` }), "peer-pw"),
    })
  const signIn = async () =>
    (await services.auth.login("peer-pw", email, OLD)) ?? (await services.auth.login("peer-pw", email, NEW))

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email, password: OLD } })
  })
  afterAll(async () => {
    await db.delete(admins).where(eq(admins.email, email))
    await db.delete(rateLimits).where(like(rateLimits.key, "%peer-pw%"))
    await db.close()
  })

  test("refuses a wrong current password and leaves everything as it was", async () => {
    const mine = (await signIn())!
    await expect(
      client(mine.token).account.changePassword({ currentPassword: "nope-nope-nope", newPassword: NEW }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Wrong current password." })
    expect(await services.auth.login("peer-pw", email, OLD)).not.toBeNull()
  })

  test("changes the password, signs the other sessions out, keeps the caller and stores no password", async () => {
    const mine = (await signIn())!
    const other = (await signIn())!
    await client(mine.token).account.changePassword({ currentPassword: OLD, newPassword: NEW })

    expect(await services.auth.admin(mine.token)).not.toBeNull()
    expect(await services.auth.admin(other.token)).toBeNull()
    expect(await services.auth.login("peer-pw", email, OLD)).toBeNull()
    expect(await services.auth.login("peer-pw", email, NEW)).not.toBeNull()

    const [owner] = await db.select().from(admins).where(eq(admins.email, email))
    const audit = await db
      .select()
      .from(settings)
      .where(like(settings.key, `admin-audit:${owner!.id}:%`))
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit[0]!.value)).not.toContain(OLD)
    expect(JSON.stringify(audit[0]!.value)).not.toContain(NEW)
    expect(await db.select().from(adminSessions).where(eq(adminSessions.adminId, owner!.id))).not.toHaveLength(0)
  })

  test("a short or unchanged new password is refused", async () => {
    const mine = (await signIn())!
    await expect(
      client(mine.token).account.changePassword({ currentPassword: NEW, newPassword: "short" }),
    ).rejects.toThrow()
    await expect(
      client(mine.token).account.changePassword({ currentPassword: NEW, newPassword: NEW }),
    ).rejects.toThrow()
  })

  test("guessing the current password is rate limited", async () => {
    const mine = (await signIn())!
    for (let i = 0; i < LIMITS.passwordChange.max; i++) {
      await expect(
        client(mine.token).account.changePassword({
          currentPassword: `guess-${i}-guess`,
          newPassword: "another long passphrase",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }
    await expect(
      client(mine.token).account.changePassword({ currentPassword: NEW, newPassword: "another long passphrase" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  test("a signed out caller is refused", async () => {
    await expect(
      client("not-a-session").account.changePassword({ currentPassword: NEW, newPassword: OLD }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })
})
