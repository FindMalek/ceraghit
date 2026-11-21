import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { ManualShippingProvider } from "../src/lib/shipping"
import { trackShipments } from "../src/lib/shipping/tracking"
import type { ShippingProvider, TrackResult } from "../src/lib/shipping/types"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("track-shipments", () => {
  const db = createDb(url!)
  const tag = `TRK-${Date.now().toString(36)}`
  const services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage: null,
    auth: new AdminAuth(db),
    now: () => new Date("2096-05-10T10:00:00Z"),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "local",
      deployEnv: "test",
      secureCookies: false,
      onlinePayments: false,
    },
  } as Services

  const event = (code: string, at: string) => ({
    code,
    description: code,
    at,
    location: "Tunis",
    comment: "",
    problemCode: null,
  })
  const carrier = (results: TrackResult[]) =>
    ({ id: "aramex", track: async () => results }) as unknown as ShippingProvider
  const waybills = [`${tag}-A`, `${tag}-B`]

  beforeAll(async () => {
    await runMigrations(db)
    for (const [i, waybill] of waybills.entries()) {
      const [order] = await db
        .insert(orders)
        .values({
          number: `${tag}-${i}`,
          publicToken: "t",
          status: "paid",
          paymentMethod: "transfer",
          currency: "TND",
          subtotalMinor: 50_000,
          totalMinor: 50_000,
          customerName: "Track Buyer",
          email: "track@example.test",
          phone: "+21620000000",
          country: "TN",
          city: "Tunis",
          address: "1 rue du test",
          locale: "fr",
        })
        .returning({ id: orders.id })
      await db.insert(shipments).values({
        orderId: order!.id,
        provider: "aramex",
        environment: "fake",
        waybill,
        productGroup: "DOM",
        productType: "ONP",
        currency: "TND",
        weightGrams: 1500,
      })
    }
  })
  afterAll(async () => {
    for (const waybill of waybills) await db.delete(shipments).where(eq(shipments.waybill, waybill))
    await db.delete(orders).where(like(orders.number, `${tag}-%`))
  })

  const row = async (waybill: string) => (await db.select().from(shipments).where(eq(shipments.waybill, waybill)))[0]!

  test("stores the events, closes a delivered parcel, and a second identical run changes nothing", async () => {
    const answer = carrier([
      {
        waybill: waybills[0]!,
        notFound: false,
        delivered: true,
        events: [event("SH005", "2096-05-10T09:00:00Z"), event("SH001", "2096-05-09T09:00:00Z")],
      },
      { waybill: waybills[1]!, notFound: true, delivered: null, events: [] },
    ])
    const first = await trackShipments(services, answer)
    expect(first).toMatchObject({ updated: 1, delivered: 1, errors: 0 })
    const done = await row(waybills[0]!)
    expect(done.status).toBe("delivered")
    expect(done.lastEvent?.code).toBe("SH005")
    expect(done.events.map((e) => e.code)).toEqual(["SH001", "SH005"])
    expect((await row(waybills[1]!)).lastPolledAt).not.toBeNull()

    const second = await trackShipments(services, answer)
    expect(second).toMatchObject({ delivered: 0 })
    expect(await row(waybills[0]!)).toEqual(done)
  })

  test("does nothing while shipping is manual", async () => {
    expect(await trackShipments(services, new ManualShippingProvider())).toEqual({ skipped: "manual shipping" })
  })
})
