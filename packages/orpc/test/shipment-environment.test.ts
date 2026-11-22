import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { admins, createDb, integrationCredentials, orders, settings, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { createFakeAramexFetch } from "../src/lib/shipping/aramex/fake"
import { cancelPickup, cancelShipment, createPickup } from "../src/lib/shipping/pickups"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const EMAIL = "shipment-env@test.local"
const KEY = `1:${Buffer.alloc(32, 2).toString("base64")}`

describe.skipIf(!url)("a shipment is only handled in the Aramex environment it was created in", () => {
  const db = createDb(url!)
  const tag = `ENV-${Date.now().toString(36)}`
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    secrets: parseKeyring(KEY),
    http: createFakeAramexFetch(),
    now: () => new Date("2096-05-10T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "preview",
      deployEnv: "pr-8",
      secureCookies: false,
      onlinePayments: false,
      aramexFake: true,
    },
  }
  let token = ""

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
    const owner = createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(base, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })
    await owner.shipping.saveSettings({
      mode: { provider: "aramex", quoteFromProvider: false },
      aramex: {
        config: {
          mode: "test",
          userName: "shop@example.test",
          accountNumber: "20016",
          accountEntity: "TUN",
          accountCountryCode: "TN",
        },
        secrets: { password: "fake-password", accountPin: "fake-pin-1234" },
      },
    })
  })

  // Created against the real test host, while this deployment answers from the simulator.
  const make = async (key: string, over: Partial<typeof shipments.$inferInsert> = {}) => {
    const [o] = await db
      .insert(orders)
      .values({
        number: `${tag}-${key}`,
        publicToken: "t",
        status: "fulfilled",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 50_000,
        totalMinor: 50_000,
        customerName: "Env Buyer",
        email: "env@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue du test",
        locale: "fr",
        carrier: "aramex",
        trackingNumber: `${tag}-${key}-W`,
        shippedAt: new Date("2096-05-09T10:00:00Z"),
      })
      .returning({ id: orders.id })
    const [s] = await db
      .insert(shipments)
      .values({
        orderId: o!.id,
        provider: "aramex",
        environment: "test",
        waybill: `${tag}-${key}-W`,
        productGroup: "DOM",
        productType: "ONP",
        currency: "TND",
        weightGrams: 1000,
        ...over,
      })
      .returning({ id: shipments.id })
    return s!.id
  }
  const row = async (id: string) => (await db.select().from(shipments).where(eq(shipments.id, id)))[0]!
  afterAll(async () => {
    await db.delete(shipments).where(like(shipments.waybill, `${tag}-%`))
    await db.delete(orders).where(like(orders.number, `${tag}-%`))
    await db.delete(integrationCredentials).where(eq(integrationCredentials.provider, "aramex"))
    await db.delete(settings).where(eq(settings.key, "shipping"))
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  test("a pickup of another environment cannot be cancelled and keeps its booking", async () => {
    const id = await make("A", { pickupId: "8001", pickupGuid: "guid-8001" })
    await expect(cancelPickup(base, "8001", "test")).rejects.toThrow("autre environnement Aramex")
    expect(await row(id)).toMatchObject({ pickupId: "8001", pickupGuid: "guid-8001" })
  })

  test("a parcel of another environment is not cancelled and keeps its status", async () => {
    const id = await make("B")
    await expect(cancelShipment(base, null, id, "test")).rejects.toThrow("autre environnement Aramex")
    expect(await row(id)).toMatchObject({ status: "created", errors: [] })
  })

  test("booking a pickup for a parcel of another environment is refused and the parcel is released", async () => {
    const id = await make("C")
    await expect(
      createPickup(base, { shipmentIds: [id], date: "2096-05-14", readyTime: "09:00", closingTime: "17:00" }),
    ).rejects.toThrow("autre environnement Aramex")
    expect((await row(id)).pickupGuid).toBeNull()
  })
})
