import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRouterClient } from "@orpc/server"
import { admins, createDb, integrationCredentials, rateLimits, settings } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { assertVaultKeyForRows } from "../src/lib/integrations"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { resolveShippingProvider } from "../src/lib/shipping/resolve"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const EMAIL = "ship-owner@test.local"
const PASSWORD = "SENTINEL-PASSWORD-1234"
const PIN = "SENTINEL-PIN-5678"
const KEY = `1:${Buffer.alloc(32, 1).toString("base64")}`
const fixture = (name: string) => readFileSync(new URL(`./fixtures/aramex/${name}.json`, import.meta.url), "utf8")
const config = {
  mode: "test" as const,
  userName: "shop@example.test",
  accountNumber: "20016",
  accountEntity: "TUN",
  accountCountryCode: "TN",
}

describe.skipIf(!url)("shipping settings", () => {
  const db = createDb(url!)
  const urls: string[] = []
  let answers: string[] = []
  const http = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response(answers[Math.min(urls.length - 1, answers.length - 1)])
  }) as typeof fetch
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    secrets: parseKeyring(KEY),
    http,
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "preview",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: false,
    },
  }
  let token = ""
  const as = (services: Services) =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
  const owner = () => as(base)
  const reset = async () => {
    urls.length = 0
    answers = []
    await db.delete(integrationCredentials)
    await db.delete(settings).where(eq(settings.key, "shipping"))
    await db.delete(rateLimits)
  }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
  })
  afterAll(async () => {
    await reset()
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  test("live is refused outside production and the saved row stays untouched", async () => {
    await reset()
    await expect(
      owner().shipping.saveSettings({
        mode: { provider: "manual", quoteFromProvider: false },
        aramex: { config: { ...config, mode: "live", productTypesConfirmed: true } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(await db.select().from(integrationCredentials)).toHaveLength(0)
  })

  test("live in production needs confirmed product types, then uses the live host", async () => {
    await reset()
    const prod = as({ ...base, config: { ...base.config, appEnv: "production" } })
    const input = (confirmed: boolean) => ({
      mode: { provider: "aramex" as const, quoteFromProvider: false },
      aramex: {
        config: { ...config, mode: "live" as const, productTypesConfirmed: confirmed },
        secrets: { password: PASSWORD, accountPin: PIN },
      },
    })
    await expect(prod.shipping.saveSettings(input(false))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await prod.shipping.saveSettings(input(true))
    answers = [fixture("calculate-rate.ok")]
    const provider = await resolveShippingProvider({
      ...base,
      config: { ...base.config, appEnv: "production" },
    })
    expect(provider.id).toBe("aramex")
    await provider.testConnection()
    expect(urls[0]).not.toContain("ws.dev.aramex.net")
  })

  test("a live row in preview resolves to the test host", async () => {
    await reset()
    await owner().shipping.saveSettings({
      mode: { provider: "aramex", quoteFromProvider: false },
      aramex: { config: { ...config, mode: "test" }, secrets: { password: PASSWORD, accountPin: PIN } },
    })
    await db.update(integrationCredentials).set({ config: { ...config, mode: "live", productTypesConfirmed: true } })
    const provider = await resolveShippingProvider(base)
    answers = [fixture("fetch-countries.ok"), fixture("calculate-rate.ok")]
    await provider.testConnection()
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.includes("ws.dev.aramex.net"))).toBe(true)
  })

  test("aramex without credentials is refused", async () => {
    await reset()
    await expect(
      owner().shipping.saveSettings({ mode: { provider: "aramex", quoteFromProvider: false } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("testConnection names the failing step in French and stores nothing", async () => {
    await reset()
    answers = [fixture("login-error")]
    const failed = await owner().shipping.testConnection({ config, secrets: { password: PASSWORD, accountPin: PIN } })
    expect(failed.ok).toBe(false)
    expect(failed.steps).toEqual([
      { name: "login", ok: false, message: expect.stringContaining("Identifiants refusés") },
    ])

    urls.length = 0
    answers = [fixture("fetch-countries.ok"), fixture("login-error")]
    const rate = await owner().shipping.testConnection({ config, secrets: { password: PASSWORD, accountPin: PIN } })
    expect(rate.steps.map((s) => [s.name, s.ok])).toEqual([
      ["login", true],
      ["rate", false],
    ])

    urls.length = 0
    answers = [fixture("fetch-countries.ok"), fixture("calculate-rate.ok")]
    const ok = await owner().shipping.testConnection({ config, secrets: { password: PASSWORD, accountPin: PIN } })
    expect(ok.ok).toBe(true)

    expect(JSON.stringify([failed, rate, ok])).not.toMatch(/SENTINEL|Portal Service/)
    expect(await db.select().from(integrationCredentials)).toHaveLength(0)
  })

  test("testConnection is rate limited", async () => {
    await reset()
    answers = [fixture("login-error")]
    const run = () => owner().shipping.testConnection({ config, secrets: { password: PASSWORD, accountPin: PIN } })
    for (let i = 0; i < 10; i++) await run()
    await expect(run()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  test("getSettings never returns a secret", async () => {
    await reset()
    await owner().shipping.saveSettings({
      mode: { provider: "aramex", quoteFromProvider: false },
      aramex: { config, secrets: { password: PASSWORD, accountPin: PIN } },
    })
    const view = await owner().shipping.getSettings({})
    expect(JSON.stringify(view)).not.toContain("SENTINEL")
    expect(view.aramex.secrets.password?.configured).toBe(true)
    const [row] = await db.select().from(integrationCredentials)
    expect(row?.updatedBy).not.toBeNull()
  })

  test("without a key saving is refused, using saved secrets is refused, boot fails", async () => {
    await reset()
    const keyless = { ...base, secrets: null }
    await expect(
      as(keyless).shipping.saveSettings({
        mode: { provider: "manual", quoteFromProvider: false },
        aramex: { config, secrets: { password: PASSWORD, accountPin: PIN } },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await assertVaultKeyForRows(db, null)

    await owner().shipping.saveSettings({
      mode: { provider: "aramex", quoteFromProvider: false },
      aramex: { config, secrets: { password: PASSWORD, accountPin: PIN } },
    })
    await expect(as(keyless).shipping.testConnection({})).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(assertVaultKeyForRows(db, null)).rejects.toThrow("SECRETS_KEY")
    await assertVaultKeyForRows(db, base.secrets ?? null)
  })
})
