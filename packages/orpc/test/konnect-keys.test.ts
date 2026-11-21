import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { admins, createDb, integrationCredentials, orderItems, orders, products } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { and, eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { createOrder } from "../src/lib/orders"
import { DemoProvider, gatewayReady, resolvePayments } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { adminRouter } from "../src/routers/admin"
import { initPaymentResponse } from "./fixtures/konnect"

const url = process.env.DATABASE_URL
const EMAIL = "konnect-keys-owner@test.local"
const SENTINEL = "SENTINEL-konnect-key-1a2b"
const WALLET = "wallet-abcdef-9876"

describe.skipIf(!url)("konnect keys", () => {
  const db = createDb(url!)
  const demo = new DemoProvider("https://web.test")
  const base: Services = {
    db,
    payments: demo,
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    secrets: parseKeyring(`1:${Buffer.alloc(32, 3).toString("base64")}`),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "preview",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  let token = ""
  const withEnv = (appEnv: "preview" | "production", over: Partial<Services> = {}): Services => ({
    ...base,
    ...over,
    config: { ...base.config, appEnv },
  })
  const as = (services: Services) =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(services, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
  const reset = () => db.delete(integrationCredentials).where(eq(integrationCredentials.provider, "konnect"))
  const save = (services: Services, mode: "test" | "live") =>
    as(services).settings.konnect.save({ apiKey: SENTINEL, walletId: WALLET, mode })

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
  })
  afterAll(async () => {
    await reset()
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  test("live keys are refused outside production and test keys in production", async () => {
    await reset()
    await expect(save(withEnv("preview"), "live")).rejects.toThrow("qu'en production")
    await expect(save(withEnv("production"), "test")).rejects.toThrow("exige les clés Konnect réelles")
  })

  test("get never returns the key, only its last 4 characters and a masked wallet", async () => {
    await reset()
    await save(withEnv("preview"), "test")
    const view = await as(withEnv("preview")).settings.konnect.get()
    expect(view).toMatchObject({
      configured: true,
      source: "vault",
      mode: "test",
      walletIdMasked: "••••9876",
      keyLast4: "1a2b",
    })
    expect(JSON.stringify(view)).not.toContain(SENTINEL)
  })

  test("an env with only a mode is not a configuration", async () => {
    await reset()
    const partial = withEnv("preview", {
      config: {
        ...base.config,
        appEnv: "preview",
        envCredentials: { konnect: { apiKey: "", walletId: "", mode: "test" } },
      },
    })
    expect(await as(partial).settings.konnect.get()).toMatchObject({ configured: false, source: "none", mode: null })
  })

  test("saved keys win over the env default, which is used again once cleared", async () => {
    await reset()
    const preview = withEnv("preview")
    expect(await resolvePayments(preview)).toBe(demo)
    await save(preview, "test")
    expect(await resolvePayments(preview)).toMatchObject({ name: "konnect", mode: "test" })
    await as(preview).settings.konnect.clear()
    expect(await resolvePayments(preview)).toBe(demo)
  })

  test("a test row is never used in production, even one saved without a mode", async () => {
    await reset()
    await save(withEnv("preview"), "test")
    expect(await resolvePayments(withEnv("production"))).toBe(demo)
    await as(withEnv("preview")).integrations.save({ provider: "konnect", config: { walletId: WALLET } })
    expect(await resolvePayments(withEnv("production"))).toBe(demo)
  })

  test("the generic save refuses the wrong mode for the environment", async () => {
    await reset()
    await expect(
      as(withEnv("preview")).integrations.save({ provider: "konnect", config: { walletId: WALLET, mode: "live" } }),
    ).rejects.toThrow("qu'en production")
  })

  test("a live row is never used outside production", async () => {
    await reset()
    await save(withEnv("production"), "live")
    expect(await resolvePayments(withEnv("preview"))).toBe(demo)
  })

  test("production offers card only through live keys", async () => {
    await reset()
    expect(await gatewayReady(withEnv("production"))).toBe(false)
    await save(withEnv("production"), "live")
    expect(await gatewayReady(withEnv("production"))).toBe(true)
  })

  test("test maps a refused key to ok false and only ever reads a payment", async () => {
    await reset()
    const urls: string[] = []
    const methods: string[] = []
    const answer = (status: number) =>
      withEnv("preview", {
        http: (async (u: string, init?: RequestInit) => {
          urls.push(u)
          methods.push(init?.method ?? "GET")
          return new Response("{}", { status })
        }) as unknown as typeof fetch,
      })
    const input = { apiKey: SENTINEL, walletId: WALLET, mode: "test" as const }
    const refused = await as(answer(401)).settings.konnect.test(input)
    const accepted = await as(answer(404)).settings.konnect.test(input)
    expect(refused).toEqual({ ok: false, message: "Clé API refusée par Konnect." })
    expect(accepted.ok).toBe(true)
    expect(urls).toHaveLength(2)
    expect(methods).toEqual(["GET", "GET"])
    expect(urls.join()).not.toContain("init-payment")
    for (const u of urls) expect(u).toMatch(/^https:\/\/api\.preprod\.konnect\.network\/api\/v2\/payments\/[0-9a-f-]+$/)
    expect(JSON.stringify([refused, accepted])).not.toContain(SENTINEL)
  })

  test("createOrder asks the gateway built from the saved keys, and a refusing gateway cancels the order", async () => {
    await reset()
    await seed(db, { catalog: true })
    const piece = await db.query.products.findFirst({
      where: and(eq(products.status, "published"), eq(products.quoteOnly, false), eq(products.unique, false)),
      with: { variants: true },
    })
    if (!piece || piece.variants.length > 0) throw new Error("no plain published piece in the seed")
    await db.update(products).set({ stock: 50 }).where(eq(products.id, piece.id))
    const email = `konnect-keys-${Date.now()}@example.test`
    const calls: string[] = []
    let status = 200
    const envGateway = {
      name: "demo",
      mode: "test",
      init: async () => {
        throw new Error("the env gateway must not be used")
      },
      check: async () => {
        throw new Error("the env gateway must not be used")
      },
    } as unknown as Services["payments"]
    const services = withEnv("preview", {
      payments: envGateway,
      http: (async (u: string) => {
        calls.push(u)
        return status === 200 ? Response.json(initPaymentResponse) : new Response("no", { status })
      }) as unknown as typeof fetch,
    })
    await save(services, "test")
    const place = () =>
      createOrder(services, {
        items: [{ productId: piece.id, quantity: 1 }],
        currency: "TND",
        locale: "fr",
        paymentMethod: "online",
        customerName: "Keys Buyer",
        email,
        phone: "+21620000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue du test",
      } as Parameters<typeof createOrder>[1])
    try {
      const made = await place()
      expect(made.payUrl).toBe("https://pay.test/x")
      expect(calls[0]).toContain("https://api.preprod.konnect.network/api/v2/payments/init-payment")
      const [row] = await db.select().from(orders).where(eq(orders.number, made.number))
      expect(row).toMatchObject({ paymentProvider: "konnect", paymentRef: "ref1", status: "pending_payment" })

      status = 500
      await expect(place()).rejects.toThrow()
      const mine = await db.select().from(orders).where(eq(orders.email, email))
      expect(mine.filter((o) => o.status === "cancelled")).toHaveLength(1)
    } finally {
      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(like(orders.email, "konnect-keys-%@example.test"))
      for (const { id } of rows) {
        await db.delete(orderItems).where(eq(orderItems.orderId, id))
        await db.delete(orders).where(eq(orders.id, id))
      }
    }
  })
})
