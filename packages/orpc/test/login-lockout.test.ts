import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, rateLimits } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { LIMITS } from "../src/lib/rate-limit"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("admin.login lockout", () => {
  const db = createDb(url!)
  const tag = `lockout-${Date.now()}`
  const services = (appEnv: "local" | "preview"): Services =>
    ({
      db,
      payments: null as never,
      storage: null,
      auth: new AdminAuth(db),
      now: () => new Date(),
      config: {
        webUrl: "https://web.test",
        apiPublicUrl: "https://api.test",
        appEnv,
        deployEnv: "test",
        secureCookies: false,
        onlinePayments: false,
      },
    }) as unknown as Services
  const login = (appEnv: "local" | "preview", peer: string, forwardedFor: string, email: string) =>
    createRouterClient(adminRouter, {
      context: (): Context => createContext(services(appEnv), new Headers({ "x-forwarded-for": forwardedFor }), peer),
    }).auth.login({ email, password: "wrong-password" })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
  })
  afterAll(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `%${tag}%`))
  })

  test("a rotating spoofed x-forwarded-for does not dodge the per address lockout", async () => {
    const peer = `${tag}-peer`
    for (let i = 0; i < LIMITS.loginIp.max; i++) {
      await expect(login("preview", peer, `9.9.9.${i}`, `${tag}-${i}@x.test`)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      })
    }
    await expect(login("preview", peer, "9.9.9.200", `${tag}-last@x.test`)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    })
  })

  test("locally the forwarded address picks the bucket", async () => {
    const mine = `${tag}-a`
    for (let i = 0; i < LIMITS.loginIp.max; i++) {
      await expect(login("local", "127.0.0.1", mine, `${tag}-l${i}@x.test`)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      })
    }
    await expect(login("local", "127.0.0.1", mine, `${tag}-lx@x.test`)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    })
    await expect(login("local", "127.0.0.1", `${tag}-b`, `${tag}-ly@x.test`)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})
