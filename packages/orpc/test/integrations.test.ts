import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { admins, createDb, integrationCredentials } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { INTEGRATION_PROVIDERS } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { getIntegration, rotateSecrets } from "../src/lib/integrations"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { type Keyring, parseKeyring } from "../src/lib/secrets"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const EMAIL = "vault-owner@test.local"
const SENTINEL = "SENTINEL-9f8e7d6c5b4a"
const K1 = `1:${Buffer.alloc(32, 1).toString("base64")}`
const K2 = `2:${Buffer.alloc(32, 2).toString("base64")}`

describe.skipIf(!url)("integrations vault", () => {
  const db = createDb(url!)
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    secrets: parseKeyring(K1),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: false,
    },
  }
  const as = (services: Services, token: string) =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
  let owner: ReturnType<typeof as>
  let token = ""

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
    owner = as(base, token)
  })
  afterAll(async () => {
    await db.delete(integrationCredentials)
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  const reset = () => db.delete(integrationCredentials)
  const rawRow = async (provider: string) =>
    (await db.select().from(integrationCredentials).where(eq(integrationCredentials.provider, provider)))[0]

  test("a saved secret is masked in every output and encrypted in the row", async () => {
    await reset()
    const key = `${SENTINEL}-long-key-1234`
    const saved = await owner.integrations.save({
      provider: "groq",
      secrets: { apiKey: key },
    })
    expect(saved.secrets.apiKey).toEqual({ configured: true, hint: "••••1234" })
    expect(saved.source).toBe("db")
    const outputs = JSON.stringify([
      saved,
      await owner.integrations.get({ provider: "groq" }),
      await owner.integrations.list({}),
    ])
    expect(outputs).not.toContain(SENTINEL)

    const row = await rawRow("groq")
    expect(JSON.stringify(row)).not.toContain(SENTINEL)
    expect(row?.secretsEnc?.startsWith("v1.")).toBe(true)
    expect(row?.keyVersion).toBe(1)
    expect(row?.updatedBy).not.toBeNull()
  })

  test("short secrets get no hint, omitted keeps, null clears", async () => {
    await reset()
    await owner.integrations.save({ provider: "aramex", secrets: { password: "short1", accountPin: "1234" } })
    expect((await owner.integrations.get({ provider: "aramex" })).secrets.password).toEqual({
      configured: true,
      hint: null,
    })
    await owner.integrations.save({ provider: "aramex", secrets: { accountPin: "9999" } })
    expect((await getIntegration(base, "aramex"))?.secrets).toEqual({ password: "short1", accountPin: "9999" })
    const cleared = await owner.integrations.save({ provider: "aramex", secrets: { password: null } })
    expect(cleared.secrets.password?.configured).toBe(false)
    expect(cleared.secrets.accountPin?.configured).toBe(true)
  })

  test("unknown secret field is rejected", async () => {
    await reset()
    await expect(owner.integrations.save({ provider: "groq", secrets: { nope: "x" } })).rejects.toThrow(
      "Champ inconnu.",
    )
    await expect(owner.integrations.save({ provider: "groq", secrets: { apiKey: "" } })).rejects.toThrow()
  })

  test("without a vault key saving is refused and reads fall back to the env", async () => {
    await reset()
    const noVault: Services = {
      ...base,
      secrets: null,
      config: {
        ...base.config,
        envCredentials: { groq: { apiKey: `${SENTINEL}-env-key-5678` } },
      },
    }
    const client = as(noVault, token)
    await expect(client.integrations.save({ provider: "groq", secrets: { apiKey: "x" } })).rejects.toThrow(
      "Le coffre des clés n'est pas configuré sur ce serveur.",
    )
    const got = await client.integrations.get({ provider: "groq" })
    expect(got).toMatchObject({
      source: "env",
      vaultAvailable: false,
      secrets: { apiKey: { configured: true, hint: "••••5678" } },
    })
    expect(JSON.stringify(got)).not.toContain(SENTINEL)
    expect((await getIntegration(noVault, "groq"))?.secrets.apiKey).toContain(SENTINEL)
  })

  test("a DB row wins over the env as a whole, clear brings the env back", async () => {
    await reset()
    const withEnv: Services = {
      ...base,
      config: {
        ...base.config,
        envCredentials: { aramex: { password: "env-password", userName: "env-user" } },
      },
    }
    const client = as(withEnv, token)
    await client.integrations.save({ provider: "aramex", secrets: { password: "db-password" } })
    expect(await getIntegration(withEnv, "aramex")).toMatchObject({
      source: "db",
      config: {},
      secrets: { password: "db-password" },
    })
    await client.integrations.clear({ provider: "aramex" })
    expect((await rawRow("aramex"))?.secretsEnc).toBeNull()
    expect((await rawRow("aramex"))?.updatedBy).not.toBeNull()
    expect(await getIntegration(withEnv, "aramex")).toMatchObject({
      source: "env",
      config: { userName: "env-user" },
    })
  })

  test("a ciphertext copied to another provider does not decrypt", async () => {
    await reset()
    await owner.integrations.save({ provider: "groq", secrets: { apiKey: SENTINEL } })
    const row = (await rawRow("groq"))!
    await db.insert(integrationCredentials).values({ ...row, provider: "aramex" })
    expect(await getIntegration(base, "aramex")).toBeNull()
    await expect(owner.integrations.save({ provider: "aramex", secrets: { password: "x" } })).rejects.toThrow(
      "illisibles",
    )
    const lost: Services = { ...base, secrets: parseKeyring(K2) }
    expect(await getIntegration(lost, "groq")).toBeNull()
    // the masked view of an unreadable row still answers and leaks nothing
    expect(JSON.stringify(await owner.integrations.get({ provider: "aramex" }))).not.toContain(SENTINEL)
  })

  test("rotation re-encrypts to the current key and the old one can go", async () => {
    await reset()
    await owner.integrations.save({ provider: "groq", secrets: { apiKey: SENTINEL } })
    const rotating = parseKeyring(K2, K1) as Keyring
    expect(await rotateSecrets(db, rotating)).toEqual({ rotated: 1 })
    expect((await rawRow("groq"))?.keyVersion).toBe(2)
    expect(await rotateSecrets(db, rotating)).toEqual({ rotated: 0 })
    const v2: Services = { ...base, secrets: parseKeyring(K2) }
    expect((await getIntegration(v2, "groq"))?.secrets.apiKey).toBe(SENTINEL)
  })

  test("no admin read procedure carries a stored secret", async () => {
    await reset()
    for (const provider of INTEGRATION_PROVIDERS) {
      const field = provider === "aramex" ? "password" : "apiKey"
      await owner.integrations.save({ provider, secrets: { [field]: SENTINEL } })
    }
    const seen: string[] = []
    const walk = async (node: object, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        const proc = value as {
          "~orpc"?: { inputSchema?: { safeParse: (v: unknown) => { success: boolean } }; route?: { method?: string } }
        }
        if (proc["~orpc"]) {
          const def = proc["~orpc"]
          if (def.route?.method !== "GET" || !def.inputSchema?.safeParse({}).success) continue
          const call = path.reduce<any>((c, step) => c[step], owner)[key]
          seen.push(JSON.stringify(await call({}).catch(() => null)))
        } else if (typeof value === "object" && value) await walk(value, [...path, key])
      }
    }
    await walk(adminRouter, [])
    expect(seen.length).toBeGreaterThan(5)
    expect(seen.join("\n")).not.toContain(SENTINEL)
  })
})
