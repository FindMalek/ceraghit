import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { cancelPickup, cancelShipment, createPickup } from "../src/lib/shipping/pickups"
import type { PickupRequest, ShippingProvider } from "../src/lib/shipping/types"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("aramex pickups and cancellation", () => {
  const db = createDb(url!)
  const tag = `PCK-${Date.now().toString(36)}`
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

  const sent: { pickups: PickupRequest[]; cancelled: string[]; held: string[] } = {
    pickups: [],
    cancelled: [],
    held: [],
  }
  let holdFails = false
  const carrier = {
    id: "aramex",
    validatePickup: async () => ({ valid: true, message: null }),
    createPickup: async (req: PickupRequest) => {
      sent.pickups.push(req)
      return { id: "5551", guid: "guid-5551" }
    },
    cancelPickup: async (guid: string) => void sent.cancelled.push(guid),
    cancel: async (waybill: string) => {
      if (holdFails) throw new Error("hold refused")
      sent.held.push(waybill)
      return { held: true, message: "" }
    },
  } as unknown as ShippingProvider

  let monday = "2096-05-14"
  while (new Date(`${monday}T12:00:00Z`).getUTCDay() === 0) monday = "2096-05-15"
  const window = { date: monday, readyTime: "09:00", closingTime: "17:00" }

  const ids: Record<string, { order: string; shipment: string }> = {}
  const mk = async (key: string, order: Partial<typeof orders.$inferInsert>, status: "created" | "in_transit") => {
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
        customerName: "Pickup Buyer",
        email: "pickup@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue du test",
        locale: "fr",
        carrier: "aramex",
        trackingNumber: `${tag}-${key}-W`,
        shippedAt: new Date("2096-05-09T10:00:00Z"),
        ...order,
      })
      .returning({ id: orders.id })
    const [s] = await db
      .insert(shipments)
      .values({
        orderId: o!.id,
        provider: "aramex",
        environment: "fake",
        waybill: `${tag}-${key}-W`,
        productGroup: "DOM",
        productType: "ONP",
        status,
        currency: "TND",
        weightGrams: 1500,
      })
      .returning({ id: shipments.id })
    ids[key] = { order: o!.id, shipment: s!.id }
  }

  beforeAll(async () => {
    await runMigrations(db)
    await mk("A", {}, "created")
    await mk("B", {}, "created")
    await mk("C", { paymentMethod: "cod", paymentProvider: "cod", paidAt: new Date("2096-05-09T10:00:00Z") }, "created")
    await mk("D", {}, "in_transit")
    await mk("E", {}, "created")
  })
  afterAll(async () => {
    await db.delete(shipments).where(like(shipments.waybill, `${tag}-%`))
    await db.delete(orders).where(like(orders.number, `${tag}-%`))
  })

  const shipment = async (key: string) =>
    (await db.select().from(shipments).where(eq(shipments.id, ids[key]!.shipment)))[0]!
  const order = async (key: string) => (await db.select().from(orders).where(eq(orders.id, ids[key]!.order)))[0]!

  test("books one pickup for several parcels, stores its ids, refuses to book a parcel twice, then cancels it", async () => {
    const { pickupId } = await createPickup(
      services,
      { ...window, shipmentIds: [ids.A!.shipment, ids.B!.shipment] },
      carrier,
    )
    expect(pickupId).toBe("5551")
    expect(sent.pickups[0]).toMatchObject({
      waybills: [`${tag}-A-W`, `${tag}-B-W`],
      pieces: 2,
      weightGrams: 3000,
      pickupDate: new Date(`${monday}T09:00:00+01:00`),
      closingTime: new Date(`${monday}T17:00:00+01:00`),
    })
    expect(await shipment("A")).toMatchObject({ pickupId: "5551", pickupGuid: "guid-5551" })
    await expect(createPickup(services, { ...window, shipmentIds: [ids.A!.shipment] }, carrier)).rejects.toMatchObject({
      message: expect.stringContaining("déjà dans un enlèvement"),
    })

    await cancelPickup(services, "5551", "changement de plan", carrier)
    expect(sent.cancelled).toEqual(["guid-5551"])
    expect(await shipment("B")).toMatchObject({ pickupId: null, pickupGuid: null })
  })

  test("a window that is too short or on a Sunday, and a parcel already at Aramex, are refused", async () => {
    const short = { ...window, closingTime: "10:00" }
    await expect(createPickup(services, { ...short, shipmentIds: [ids.A!.shipment] }, carrier)).rejects.toThrow(
      "fenêtre d'enlèvement",
    )
    let sunday = "2096-05-13"
    while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = `2096-05-${Number(sunday.slice(-2)) + 1}`
    await expect(
      createPickup(services, { ...window, date: sunday, shipmentIds: [ids.A!.shipment] }, carrier),
    ).rejects.toThrow("fenêtre d'enlèvement")
    await expect(createPickup(services, { ...window, shipmentIds: [ids.D!.shipment] }, carrier)).rejects.toThrow(
      "étiquette vient d'être créée",
    )
  })

  test("cancelling a fresh parcel holds it and puts the paid order back, a cash order back to awaiting payment", async () => {
    const res = await cancelShipment(services, null, ids.A!.shipment, "erreur d'adresse", carrier)
    expect(res.held).toBe(true)
    expect(sent.held).toEqual([`${tag}-A-W`])
    expect(await shipment("A")).toMatchObject({ status: "cancelled" })
    expect(await order("A")).toMatchObject({ status: "paid", carrier: null, trackingNumber: null, shippedAt: null })

    await cancelShipment(services, null, ids.C!.shipment, "erreur d'adresse", carrier)
    expect(await order("C")).toMatchObject({ status: "pending_payment", paidAt: null, paymentProvider: "cod" })
  })

  test("a parcel already moving cannot be cancelled and nothing changes", async () => {
    await expect(cancelShipment(services, null, ids.D!.shipment, "trop tard", carrier)).rejects.toThrow(
      "déjà chez Aramex",
    )
    expect((await shipment("D")).status).toBe("in_transit")
    expect((await order("D")).status).toBe("fulfilled")
  })

  test("a refused hold still cancels locally and says to call the agency", async () => {
    holdFails = true
    try {
      const res = await cancelShipment(services, null, ids.E!.shipment, "doublon", carrier)
      expect(res.held).toBe(false)
      const row = await shipment("E")
      expect(row.status).toBe("cancelled")
      expect(row.errors.at(-1)?.code).toBe("HOLD")
    } finally {
      holdFails = false
    }
  })
})
