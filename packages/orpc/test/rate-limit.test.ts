import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, rateLimits } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { like } from "drizzle-orm"
import { AdminAuth } from "../src/lib/auth"
import { LIMITS, sweepRateLimits, takeLimit, withinLimit } from "../src/lib/rate-limit"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("rate limits", () => {
  const db = createDb(url!)
  const tag = `rl${Date.now()}`
  let clock = new Date()
  const auth = new AdminAuth(db, () => clock)
  const email = "owner@test.local"

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { demo: false, admin: { email, password: "clay-test-pass" } })
  })
  afterAll(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `%${tag}%`))
    await db.delete(rateLimits).where(like(rateLimits.key, "login:%"))
  })

  test("the sixth wrong password from one address is refused, another address is not, a new window allows again", async () => {
    clock = new Date()
    const here = `1.1.1.${tag}`
    for (let i = 0; i < LIMITS.loginIp.max; i++) {
      expect(await auth.locked(here, email)).toBeNull()
      expect(await auth.login(here, email, "wrong")).toBeNull()
    }
    expect(await auth.locked(here, email)).toBe("ip")
    expect(await auth.login(here, email, "clay-test-pass")).toBeNull()
    expect(await auth.login(`2.2.2.${tag}`, email, "clay-test-pass")).not.toBeNull()

    clock = new Date(clock.getTime() + LIMITS.loginIp.windowMs + 1)
    expect(await auth.locked(here, email)).toBeNull()
    expect(await auth.login(here, email, "clay-test-pass")).not.toBeNull()
  })

  test("a correct password clears the failures so the owner is never locked by typos", async () => {
    clock = new Date()
    const here = `3.3.3.${tag}`
    for (let i = 0; i < LIMITS.loginIp.max - 1; i++) await auth.login(here, email, "wrong")
    expect(await auth.login(here, email, "clay-test-pass")).not.toBeNull()
    expect(await auth.locked(here, email)).toBeNull()
  })

  test("the email is locked across addresses, rotating them does not help", async () => {
    clock = new Date()
    for (let i = 0; i < LIMITS.loginEmail.max; i++) await auth.login(`10.0.${i}.${tag}`, email, "wrong")
    expect(await auth.locked(`9.9.9.${tag}`, email)).toBe("email")
  })

  test("takeLimit counts per key and sweeps old rows", async () => {
    const now = new Date()
    const limit = { max: 2, windowMs: 1000 }
    const key = `t:${tag}`
    expect([await takeLimit(db, key, limit, now), await takeLimit(db, key, limit, now)]).toEqual([true, true])
    expect(await takeLimit(db, key, limit, now)).toBe(false)
    expect(await sweepRateLimits(db, new Date(now.getTime() + 2 * 864e5))).toBeGreaterThan(0)
    expect(await takeLimit(db, key, limit, now)).toBe(true)
  })

  test("delivery quotes past the limit are told so without an error, per address, and a new window allows again", async () => {
    const ctx = (address: string) => ({
      db,
      headers: new Headers({ "x-forwarded-for": address }),
      now: () => clock,
      config: { appEnv: "local" },
    })
    clock = new Date()
    const here = `4.4.4.${tag}`
    for (let i = 0; i < LIMITS.shippingQuote.max; i++) expect(await withinLimit(ctx(here), "shippingQuote")).toBe(true)
    expect(await withinLimit(ctx(here), "shippingQuote")).toBe(false)
    expect(await withinLimit(ctx(`5.5.5.${tag}`), "shippingQuote")).toBe(true)

    clock = new Date(clock.getTime() + LIMITS.shippingQuote.windowMs + 1)
    expect(await withinLimit(ctx(here), "shippingQuote")).toBe(true)
  })
})
