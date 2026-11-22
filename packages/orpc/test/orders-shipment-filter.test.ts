import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { inArray, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { DemoProvider } from "../src/lib/payments"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("orders list by shipment", () => {
  const db = createDb(url!)
  const services: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: { send: async () => ({ id: null }) },
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: true,
    },
  }
  const clientFor = (headers: Headers) =>
    createRouterClient(adminRouter, { context: (): Context => createContext(services, headers) })
  const tag = `TST-SF-${Date.now().toString(36)}`
  let owner: ReturnType<typeof clientFor>
  let seq = 0

  const parcel = async (status?: typeof shipments.$inferInsert.status) => {
    const number = `${tag}-${seq++}`
    const [row] = await db
      .insert(orders)
      .values({
        number,
        publicToken: "t",
        status: "fulfilled",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 50_000,
        totalMinor: 50_000,
        customerName: "Ship Filter",
        email: "sf@example.test",
        phone: "20000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue Test",
      })
      .returning({ id: orders.id })
    if (status)
      await db.insert(shipments).values({
        orderId: row!.id,
        provider: "aramex",
        environment: "fake",
        waybill: `${number}-W`,
        productGroup: "DOM",
        productType: "ONP",
        currency: "TND",
        weightGrams: 900,
        status,
      })
    return number
  }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    owner = clientFor(new Headers({ cookie: `ceraghit_admin=${session!.token}`, "x-csrf-token": "orpc" }))
  })

  afterAll(async () => {
    const mine = await db
      .select({ id: orders.id })
      .from(orders)
      .where(like(orders.number, `${tag}-%`))
    const ids = mine.map((o) => o.id)
    if (ids.length) {
      await db.delete(shipments).where(inArray(shipments.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.close()
  })

  test("each order carries its parcel status and the filter splits open, delivered and problem", async () => {
    const transit = await parcel("in_transit")
    const done = await parcel("delivered")
    const stuck = await parcel("exception")
    const none = await parcel()
    const numbers = async (shipment?: "open" | "delivered" | "problem") =>
      (await owner.orders.list({ q: tag, shipment, limit: 50 })).map((o) => o.number).sort()

    expect(await numbers()).toEqual([transit, done, stuck, none].sort())
    expect(await numbers("open")).toEqual([transit])
    expect(await numbers("delivered")).toEqual([done])
    expect(await numbers("problem")).toEqual([stuck])

    const all = await owner.orders.list({ q: tag, limit: 50 })
    expect(all.find((o) => o.number === none)?.shipmentStatus).toBeNull()
    expect(all.find((o) => o.number === stuck)?.shipmentStatus).toBe("exception")
  })

  test("the overview counts parcels still on their way", async () => {
    const before = await owner.overview({ days: 7 })
    await parcel("out_for_delivery")
    await parcel("delivered")
    expect((await owner.overview({ days: 7 })).openShipments - before.openShipments).toBe(1)
  })
})
