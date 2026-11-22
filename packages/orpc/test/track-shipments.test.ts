import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { ManualShippingProvider } from "../src/lib/shipping"
import { saveShippingSettings } from "../src/lib/shipping/settings"
import { trackShipments } from "../src/lib/shipping/tracking"
import type { ShippingProvider, TrackResult } from "../src/lib/shipping/types"
import { appRouter } from "../src/routers"

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
  const waybills = [`${tag}-A`, `${tag}-B`, `${tag}-C`, `${tag}-D`, `${tag}-E`, `${tag}-F`]

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
    expect(first).toMatchObject({ updated: 1, delivered: 1 })
    const done = await row(waybills[0]!)
    expect(done.status).toBe("delivered")
    expect(done.lastEvent?.code).toBe("SH005")
    expect(done.events.map((e) => e.code)).toEqual(["SH001", "SH005"])
    expect((await row(waybills[1]!)).lastPolledAt).not.toBeNull()

    const second = await trackShipments(services, answer)
    expect(second).toMatchObject({ delivered: 0 })
    expect(await row(waybills[0]!)).toEqual(done)
  })

  test("tells the hooks once when a parcel has an incident, then follows it to delivery", async () => {
    const delivered: string[] = []
    const incidents: string[] = []
    const hooked = {
      ...services,
      hooks: {
        shipmentDelivered: async (id: string) => void delivered.push(id),
        shipmentException: async (id: string) => void incidents.push(id),
      },
    } as Services
    const problem = { ...event("SH047", "2096-05-10T08:00:00Z"), problemCode: "P10" }
    const id = (await row(waybills[2]!)).id
    const stuck = carrier([{ waybill: waybills[2]!, notFound: false, delivered: false, events: [problem] }])
    await trackShipments(hooked, stuck, { shipmentId: id })
    await trackShipments(hooked, stuck, { shipmentId: id })
    expect((await row(waybills[2]!)).status).toBe("exception")
    expect(incidents).toHaveLength(1)

    const done = carrier([
      {
        waybill: waybills[2]!,
        notFound: false,
        delivered: true,
        events: [problem, event("SH005", "2096-05-10T09:30:00Z")],
      },
    ])
    await trackShipments(hooked, done, { shipmentId: id })
    const closed = await row(waybills[2]!)
    expect(closed.status).toBe("delivered")
    expect(closed.deliveredAt?.toISOString()).toBe("2096-05-10T09:30:00.000Z")
    await trackShipments(hooked, done)
    expect(delivered).toEqual([id])
  })

  test("the customer's order page gets our own status, never the raw carrier text or the internal comment", async () => {
    const raw = "Held at hub: consignee refused, call 98 765 432"
    const internal = "AGENT-NOTE-7731"
    const incident = {
      ...event("SH047", "2096-05-10T08:00:00Z"),
      description: raw,
      comment: internal,
      problemCode: "P10",
      location: "Hub Radès",
    }
    await trackShipments(
      services,
      carrier([{ waybill: waybills[5]!, notFound: false, delivered: false, events: [incident] }]),
    )
    expect((await row(waybills[5]!)).status).toBe("exception")
    await db
      .update(orders)
      .set({ status: "fulfilled", carrier: "aramex", trackingNumber: waybills[5]!, shippedAt: services.now() })
      .where(eq(orders.number, `${tag}-5`))
    const visitor = createRouterClient(appRouter, {
      context: (): Context => createContext(services, new Headers({ "x-forwarded-for": "203.0.113.9" })),
    })
    const page = await visitor.public.orders.get({ number: `${tag}-5`, token: "t" })
    expect(page.shipping?.parcelStatus).toBe("exception")
    const text = JSON.stringify(page)
    for (const leaked of [raw, internal, "Hub Radès", "98 765 432", "SH047"]) expect(text).not.toContain(leaked)
  })

  test("a refresh polls only the shipment it was asked for", async () => {
    const target = await row(waybills[3]!)
    const answer = carrier([
      { waybill: waybills[3]!, notFound: false, delivered: false, events: [event("SH012", "2096-05-10T07:00:00Z")] },
    ])
    const report = await trackShipments(services, answer, { shipmentId: target.id })
    expect(report).toMatchObject({ polled: 1, updated: 1 })
    expect((await row(waybills[3]!)).status).toBe("picked_up")
  })

  test("a slow poll that read the parcel before a fast one delivered it changes nothing and fires no hook", async () => {
    const incidents: string[] = []
    const hooked = {
      ...services,
      hooks: { shipmentException: async (id: string) => void incidents.push(id) },
    } as Services
    const id = (await row(waybills[4]!)).id
    const slow = {
      id: "aramex",
      track: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return [
          {
            waybill: waybills[4]!,
            notFound: false,
            delivered: false,
            events: [{ ...event("SH047", "2096-05-10T06:00:00Z"), problemCode: "P10" }],
          },
        ]
      },
    } as unknown as ShippingProvider
    const fast = carrier([
      {
        waybill: waybills[4]!,
        notFound: false,
        delivered: true,
        events: [event("SH005", "2096-05-10T09:00:00Z")],
      },
    ])
    await Promise.all([
      trackShipments(services, slow, { shipmentId: id }),
      trackShipments(hooked, fast, { shipmentId: id }),
    ])
    const final = await row(waybills[4]!)
    expect(final.status).toBe("delivered")
    expect(final.events.map((e) => e.code)).toEqual(["SH005"])
    expect(incidents).toEqual([])
  })

  test("does nothing while shipping is manual", async () => {
    expect(await trackShipments(services, new ManualShippingProvider())).toEqual({ skipped: "manual shipping" })
  })

  test("a failing carrier call fails the run instead of reporting success", async () => {
    const broken = {
      id: "aramex",
      track: async () => Promise.reject(new Error("aramex 503")),
    } as unknown as ShippingProvider
    await expect(trackShipments(services, broken)).rejects.toThrow("aramex 503")
  })

  test("skips when Aramex is selected but its credentials are missing", async () => {
    await saveShippingSettings(db, { provider: "aramex", quoteFromProvider: true })
    try {
      expect(await trackShipments(services)).toEqual({ skipped: "missing-credentials" })
    } finally {
      await saveShippingSettings(db, { provider: "manual", quoteFromProvider: false })
    }
  })
})
