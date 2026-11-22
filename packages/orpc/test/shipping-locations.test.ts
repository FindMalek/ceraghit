import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import {
  admins,
  createDb,
  integrationCredentials,
  orderItems,
  orders,
  products,
  productVariants,
  rateLimits,
  settings,
} from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { and, eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { createOrder } from "../src/lib/orders"
import { DemoProvider } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { createFakeAramexFetch, FAKE_CITIES } from "../src/lib/shipping/aramex/fake"
import { getCities, resetCitiesFailures, searchCities } from "../src/lib/shipping/locations"
import { adminRouter } from "../src/routers/admin"
import { publicRouter } from "../src/routers/public"

const url = process.env.DATABASE_URL
const EMAIL = "locations-owner@test.local"
const KEY = `1:${Buffer.alloc(32, 1).toString("base64")}`
const config = {
  mode: "test" as const,
  userName: "shop@example.test",
  accountNumber: "20016",
  accountEntity: "TUN",
  accountCountryCode: "TN",
}
const TN_KEY = "aramex:cities:TN"

describe.skipIf(!url)("aramex city list and address checks", () => {
  const db = createDb(url!)
  const fake = createFakeAramexFetch()
  const calls: string[] = []
  const validated: { Line1?: string; City?: string; PostCode?: string }[] = []
  let down = false
  let serviced: boolean | null = null
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input))
    if (String(input).endsWith("/ValidateAddress")) validated.push(JSON.parse(String(init?.body ?? "{}")).Address)
    if (down) throw new Error("network down")
    if (serviced !== null && String(input).endsWith("/IsAddressServiced"))
      return new Response(
        JSON.stringify({ Transaction: null, Notifications: [], HasErrors: false, IsServiced: serviced }),
      )
    return fake(input, init)
  }) as typeof fetch
  let now = new Date()
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    secrets: parseKeyring(KEY),
    http,
    now: () => now,
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
  const owner = () =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(base, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
  const visitor = () => createRouterClient(publicRouter, { context: (): Context => createContext(base, new Headers()) })
  const cityCalls = () => calls.filter((c) => c.endsWith("/FetchCities")).length
  const clear = async () => {
    calls.length = 0
    down = false
    resetCitiesFailures()
    now = new Date()
    await db.delete(settings).where(eq(settings.key, TN_KEY))
  }
  const setProvider = (provider: "manual" | "aramex") =>
    owner().shipping.saveSettings({
      mode: { provider, quoteFromProvider: false },
      aramex: { config, secrets: { password: "fake-password", accountPin: "fake-pin-1234" } },
    })

  let productId = ""
  let variantId: string | undefined
  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { catalog: true, admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
    await setProvider("aramex")
    const piece = await db.query.products.findFirst({
      where: and(eq(products.status, "published"), eq(products.quoteOnly, false), eq(products.unique, false)),
      with: { variants: true },
    })
    productId = piece!.id
    variantId = piece!.variants[0]?.id
    await db.update(products).set({ stock: 50 }).where(eq(products.id, productId))
    if (variantId) await db.update(productVariants).set({ stock: 50 }).where(eq(productVariants.id, variantId))
  })
  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.email, "locations-%@example.test"))
    for (const { id } of mine) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id))
      await db.delete(orders).where(eq(orders.id, id))
    }
    await db.delete(settings).where(eq(settings.key, TN_KEY))
    await db.delete(settings).where(eq(settings.key, "shipping"))
    await db.delete(integrationCredentials).where(eq(integrationCredentials.provider, "aramex"))
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  test("the list is fetched once, then served from the cache for a week", async () => {
    await clear()
    const first = await getCities(base, "TN")
    expect(first).toMatchObject({ source: "aramex", cities: [...FAKE_CITIES].sort((a, b) => a.localeCompare(b)) })
    expect((await getCities(base, "TN")).source).toBe("cache")
    expect(cityCalls()).toBe(1)
    now = new Date(Date.now() + 8 * 24 * 3600_000)
    expect((await getCities(base, "TN")).source).toBe("aramex")
    expect(cityCalls()).toBe(2)
  })

  test("when Aramex is down the stale list is served, and with no list the customer is never blocked", async () => {
    await clear()
    await getCities(base, "TN")
    now = new Date(Date.now() + 8 * 24 * 3600_000)
    down = true
    expect(await getCities(base, "TN")).toMatchObject({ source: "cache" })
    await db.delete(settings).where(eq(settings.key, TN_KEY))
    expect(await visitor().catalog.shippingCities({ country: "TN" })).toEqual({ cities: [], strict: false })
  })

  test("manual mode never calls Aramex, and only the demo list is served", async () => {
    await clear()
    await setProvider("manual")
    expect(await getCities(base, "TN")).toMatchObject({ source: "none", cities: [] })
    await db
      .insert(settings)
      .values({ key: TN_KEY, value: { cities: ["Tunis"], fetchedAt: now.toISOString(), fixture: true } })
    expect((await getCities(base, "TN")).cities).toEqual(["Tunis"])
    expect(cityCalls()).toBe(0)
    await setProvider("aramex")
  })

  test("the public search ignores case and accents and is capped", async () => {
    await clear()
    expect((await visitor().catalog.shippingCities({ country: "TN", q: "GABES" })).cities).toEqual(["Gabès"])
    expect((await visitor().catalog.shippingCities({ country: "TN", q: "" })).strict).toBe(true)
    expect(
      searchCities(
        Array.from({ length: 80 }, (_, i) => `Ville ${i}`),
        "ville",
      ),
    ).toHaveLength(50)
  })

  test("an order stores the list's spelling, refuses an unknown city and accepts anything when there is no list", async () => {
    await clear()
    await getCities(base, "TN")
    const place = (city: string) =>
      createOrder(base, {
        items: [{ productId, variantId, quantity: 1 }],
        currency: "TND",
        locale: "fr",
        paymentMethod: "cod",
        customerName: "Locations Buyer",
        email: "locations-buyer@example.test",
        phone: "+21620000000",
        country: "TN",
        city,
        address: "1 rue du test",
      } as Parameters<typeof createOrder>[1])
    const stored = async (number: string) =>
      (await db.query.orders.findFirst({ where: eq(orders.number, number) }))?.city
    const ok = await place("sousse")
    expect(await stored(ok.number)).toBe("Sousse")
    await expect(place("Soussa")).rejects.toMatchObject({ data: { reason: "invalid_city" } })
    await db.delete(settings).where(eq(settings.key, TN_KEY))
    down = true
    const free = await place("Soussa")
    expect(await stored(free.number)).toBe("Soussa")
  })

  test("the owner's address check maps Aramex suggestions, and an Aramex failure is not an error", async () => {
    await clear()
    const [row] = await db
      .insert(orders)
      .values({
        number: `LOC-${Date.now().toString(36)}`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerName: "Locations Buyer",
        email: "locations-check@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Soussa",
        address: "1 rue du test",
        locale: "fr",
      })
      .returning({ id: orders.id })
    const typo = await owner().shipping.checkAddress({ orderId: row!.id })
    expect(typo).toMatchObject({ ok: false, suggestions: [{ city: "Sousse", postalCode: "4000" }] })
    down = true
    expect(await owner().shipping.checkAddress({ orderId: row!.id })).toMatchObject({ ok: false, suggestions: [] })
    await db.update(orders).set({ city: "Sousse" }).where(eq(orders.id, row!.id))
    down = false
    expect(await owner().shipping.checkAddress({ orderId: row!.id })).toMatchObject({ ok: true })
  })

  test("a recognised Tunisian address Aramex does not deliver to is flagged, and a bad postcode is caught first", async () => {
    await clear()
    const [row] = await db
      .insert(orders)
      .values({
        number: `LOC-${Date.now().toString(36)}-S`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerName: "Locations Buyer",
        email: "locations-serviced@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Sousse",
        address: "1 rue du test",
        locale: "fr",
      })
      .returning({ id: orders.id })
    expect(await owner().shipping.checkAddress({ orderId: row!.id })).toMatchObject({ ok: true })
    serviced = false
    expect(await owner().shipping.checkAddress({ orderId: row!.id })).toMatchObject({
      ok: false,
      message: "Aramex ne livre pas à cette adresse.",
    })
    serviced = null
    calls.length = 0
    const bad = await owner().shipping.checkAddress({
      orderId: row!.id,
      address: { line1: "1 rue du test", city: "Sousse", postalCode: "40" },
    })
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining("Code postal invalide") })
    expect(calls).toHaveLength(0)
  })

  test("a demo list is not fresh once Aramex is on: it is fetched and replaces the demo list", async () => {
    await clear()
    await db
      .insert(settings)
      .values({ key: TN_KEY, value: { cities: ["Tunis"], fetchedAt: now.toISOString(), fixture: true } })
    const got = await getCities(base, "TN")
    expect(got.source).toBe("aramex")
    expect(got.cities.length).toBe(FAKE_CITIES.length)
    expect(cityCalls()).toBe(1)
  })

  test("a failing Aramex is asked once a minute, not once per visitor", async () => {
    await clear()
    down = true
    await Promise.all([getCities(base, "TN"), getCities(base, "TN"), getCities(base, "TN")])
    // one refresh is up to three http calls (the client retries a network error twice), never one per visitor
    const burst = cityCalls()
    expect(burst).toBeLessThanOrEqual(3)
    await getCities(base, "TN")
    expect(cityCalls()).toBe(burst)
  })

  test("the address check shows a street or postcode correction, not only a city mismatch", async () => {
    await clear()
    const [row] = await db
      .insert(orders)
      .values({
        number: `LOC2-${Date.now().toString(36)}`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerName: "Locations Buyer",
        email: "locations-street@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Tunis",
        address: "avenue habib bourgiba",
        locale: "fr",
      })
      .returning({ id: orders.id })
    expect(await owner().shipping.checkAddress({ orderId: row!.id })).toMatchObject({
      ok: false,
      suggestions: [{ line1: "Avenue Habib Bourguiba", city: "Tunis", postalCode: "1000" }],
    })
  })

  test("an edited address is what Aramex is asked about, and a cleared postcode does not fall back to the order's", async () => {
    await clear()
    const [row] = await db
      .insert(orders)
      .values({
        number: `LOC3-${Date.now().toString(36)}`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerName: "Locations Buyer",
        email: "locations-edit@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Sousse",
        address: "1 rue de l'ordre",
        postalCode: "4000",
        locale: "fr",
      })
      .returning({ id: orders.id })
    validated.length = 0
    await owner().shipping.checkAddress({
      orderId: row!.id,
      address: { line1: "12 rue modifiée", city: "Tunis" },
    })
    expect(validated.at(-1)).toMatchObject({ Line1: "12 rue modifiée", City: "Tunis" })
    expect(validated.at(-1)?.PostCode ?? "").toBe("")
    await owner().shipping.checkAddress({ orderId: row!.id })
    expect(validated.at(-1)).toMatchObject({ Line1: "1 rue de l'ordre", City: "Sousse", PostCode: "4000" })
  })

  test("the public city search is rate limited", async () => {
    await clear()
    await db.delete(rateLimits).where(like(rateLimits.key, "shippingCities:%"))
    await getCities(base, "TN")
    for (let i = 0; i < 60; i++) await visitor().catalog.shippingCities({ country: "TN" })
    await expect(visitor().catalog.shippingCities({ country: "TN" })).rejects.toMatchObject({
      data: { reason: "too_many_requests" },
    })
    await db.delete(rateLimits).where(like(rateLimits.key, "shippingCities:%"))
  })
})
