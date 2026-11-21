import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, orderAudit, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { and, eq, inArray, like } from "drizzle-orm"
import type { Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { cancelPickup, cancelShipment, createPickup, listOpenShipments, PICKUP_LOST } from "../src/lib/shipping/pickups"
import { claimOrder } from "../src/lib/shipping/shipments"
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
  let duringHold: (() => Promise<void>) | null = null
  let duringCancelPickup: (() => Promise<void>) | null = null
  let cancelPickupFails = false
  let duringCreate: (() => Promise<void>) | null = null
  const carrier = {
    id: "aramex",
    validatePickup: async () => ({ valid: true, message: null }),
    createPickup: async (req: PickupRequest) => {
      sent.pickups.push(req)
      await duringCreate?.()
      return { id: "5551", guid: "guid-5551" }
    },
    cancelPickup: async (guid: string) => {
      if (cancelPickupFails) throw new Error("aramex down")
      sent.cancelled.push(guid)
      await duringCancelPickup?.()
    },
    cancel: async (waybill: string) => {
      await duringHold?.()
      if (holdFails) throw new Error("hold refused")
      sent.held.push(waybill)
      return { held: true, message: "" }
    },
  } as unknown as ShippingProvider

  let monday = "2096-05-14"
  while (new Date(`${monday}T12:00:00Z`).getUTCDay() === 0) monday = "2096-05-15"
  const window = { date: monday, readyTime: "09:00", closingTime: "17:00" }

  const ids: Record<string, { order: string; shipment: string }> = {}
  const mk = async (
    key: string,
    order: Partial<typeof orders.$inferInsert>,
    status: "created" | "in_transit",
    shippedFrom: "paid" | "pending_payment" = "paid",
  ) => {
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
    await db
      .insert(orderAudit)
      .values({ orderId: o!.id, action: "set_status", fromStatus: shippedFrom, toStatus: "fulfilled" })
    ids[key] = { order: o!.id, shipment: s!.id }
  }

  beforeAll(async () => {
    await runMigrations(db)
    await mk("A", {}, "created")
    await mk("B", {}, "created")
    await mk(
      "C",
      { paymentMethod: "cod", paymentProvider: "cod", paidAt: new Date("2096-05-09T10:00:00Z") },
      "created",
      "pending_payment",
    )
    await mk("F", { paymentMethod: "cod", paymentProvider: "cod", paidAt: new Date("2096-05-08T10:00:00Z") }, "created")
    await mk("D", {}, "in_transit")
    await mk("E", {}, "created")
    await mk("G", {}, "created")
    for (const key of ["H", "I", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T"]) await mk(key, {}, "created")
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
      pieces: 2,
      weightGrams: 3000,
      pickupDate: new Date(`${monday}T09:00:00+01:00`),
      closingTime: new Date(`${monday}T17:00:00+01:00`),
    })
    expect([...(sent.pickups[0]?.waybills ?? [])].sort()).toEqual([`${tag}-A-W`, `${tag}-B-W`])
    expect(await shipment("A")).toMatchObject({ pickupId: "5551", pickupGuid: "guid-5551" })
    await expect(createPickup(services, { ...window, shipmentIds: [ids.A!.shipment] }, carrier)).rejects.toMatchObject({
      message: expect.stringContaining("déjà dans un enlèvement"),
    })

    await cancelPickup(services, "5551", "changement de plan", carrier)
    expect(sent.cancelled).toEqual(["guid-5551"])
    expect(await shipment("B")).toMatchObject({ pickupId: null, pickupGuid: null })
  })

  test("two simultaneous bookings of one parcel reach Aramex once", async () => {
    const before = sent.pickups.length
    const book = () => createPickup(services, { ...window, shipmentIds: [ids.G!.shipment] }, carrier)
    const results = await Promise.allSettled([book(), book()])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(sent.pickups.length - before).toBe(1)
    expect((await shipment("G")).pickupId).toBe("5551")
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

  test("a cash order the owner marked paid before shipping keeps its payment when the shipment is cancelled", async () => {
    await cancelShipment(services, null, ids.F!.shipment, "erreur d'adresse", carrier)
    expect(await order("F")).toMatchObject({ status: "paid", paidAt: new Date("2096-05-08T10:00:00Z") })
    const audit = await db
      .select()
      .from(orderAudit)
      .where(and(eq(orderAudit.orderId, ids.F!.order), eq(orderAudit.toStatus, "paid")))
    expect(audit).toHaveLength(1)
    expect(audit[0]?.note).toContain("erreur d'adresse")
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

  test("a cancel waits for the order claim: nothing is held or cancelled while a creation is in progress", async () => {
    const release = await claimOrder(services, ids.P!.order)
    try {
      await expect(cancelShipment(services, null, ids.P!.shipment, "doublon", carrier)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(sent.held).not.toContain(`${tag}-P-W`)
      expect((await shipment("P")).status).toBe("created")
    } finally {
      await release()
    }
  })

  test("a parcel booked in a pickup while the hold was running is not cancelled", async () => {
    duringHold = async () => {
      await db.update(shipments).set({ pickupGuid: "guid-late" }).where(eq(shipments.id, ids.J!.shipment))
    }
    try {
      await expect(cancelShipment(services, null, ids.J!.shipment, "doublon", carrier)).rejects.toThrow(
        "déjà chez Aramex",
      )
    } finally {
      duringHold = null
    }
    expect(await shipment("J")).toMatchObject({ status: "created", pickupGuid: "guid-late" })
    expect((await order("J")).status).toBe("fulfilled")
  })

  test("cancelling a pickup leaves a parcel that was booked again in the meantime alone", async () => {
    await db
      .update(shipments)
      .set({ pickupId: "7001", pickupGuid: "guid-7001" })
      .where(inArray(shipments.id, [ids.H!.shipment, ids.I!.shipment]))
    duringCancelPickup = async () => {
      await db
        .update(shipments)
        .set({ pickupId: "7002", pickupGuid: "guid-7002" })
        .where(eq(shipments.id, ids.H!.shipment))
    }
    try {
      await cancelPickup(services, "7001", "changement de plan", carrier)
    } finally {
      duringCancelPickup = null
    }
    expect(await shipment("H")).toMatchObject({ pickupId: "7002", pickupGuid: "guid-7002" })
    expect(await shipment("I")).toMatchObject({ pickupId: null, pickupGuid: null })
  })

  describe("when the booking cannot be saved", () => {
    // Fails the update that records the pickup ids, whatever its position among the other updates
    const flaky = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "update") return Reflect.get(target, prop, receiver)
        return (...args: Parameters<typeof db.update>) => {
          const builder = target.update(...args)
          return new Proxy(builder, {
            get(b, key, r) {
              if (key !== "set") return Reflect.get(b, key, r)
              return (values: Record<string, unknown>) => {
                if (values.pickupId) throw new Error("db down")
                return b.set(values as never)
              }
            },
          })
        }
      },
    })
    const flakyServices = { ...services, db: flaky } as Services

    test("the pickup is cancelled at Aramex and the parcel is free again", async () => {
      const before = sent.cancelled.length
      await expect(
        createPickup(flakyServices, { ...window, shipmentIds: [ids.K!.shipment] }, carrier),
      ).rejects.toMatchObject({ message: "L'enlèvement n'a pas pu être enregistré, réessayez." })
      expect(sent.cancelled.slice(before)).toEqual(["guid-5551"])
      expect(await shipment("K")).toMatchObject({ pickupId: null, pickupGuid: null })
    })

    test("when Aramex cannot cancel it either, the owner gets its reference", async () => {
      cancelPickupFails = true
      try {
        await expect(
          createPickup(flakyServices, { ...window, shipmentIds: [ids.L!.shipment] }, carrier),
        ).rejects.toMatchObject({ message: PICKUP_LOST("5551", "guid-5551") })
      } finally {
        cancelPickupFails = false
      }
      expect(await shipment("L")).toMatchObject({ pickupId: null, pickupGuid: null })
    })
  })

  test("a booking whose reservation vanished before it was saved is undone at Aramex", async () => {
    duringCreate = async () => {
      await db.update(shipments).set({ pickupGuid: null }).where(eq(shipments.id, ids.T!.shipment))
    }
    const before = sent.cancelled.length
    try {
      await expect(
        createPickup(services, { ...window, shipmentIds: [ids.T!.shipment] }, carrier),
      ).rejects.toMatchObject({ message: "L'enlèvement n'a pas pu être enregistré, réessayez." })
    } finally {
      duringCreate = null
    }
    expect(sent.cancelled.slice(before)).toEqual(["guid-5551"])
    expect(await shipment("T")).toMatchObject({ pickupId: null, pickupGuid: null })
  })

  test("listing the open parcels frees stale and timestamp-less reservations, not a fresh one", async () => {
    const stale = `reserve:${services.now().getTime() - 10 * 60_000}:${crypto.randomUUID()}`
    const fresh = `reserve:${services.now().getTime() - 1_000}:${crypto.randomUUID()}`
    await db.update(shipments).set({ pickupGuid: stale }).where(eq(shipments.id, ids.Q!.shipment))
    await db
      .update(shipments)
      .set({ pickupGuid: `reserve:${crypto.randomUUID()}` })
      .where(eq(shipments.id, ids.S!.shipment))
    await db.update(shipments).set({ pickupGuid: fresh }).where(eq(shipments.id, ids.N!.shipment))
    await listOpenShipments(services)
    expect((await shipment("Q")).pickupGuid).toBeNull()
    expect((await shipment("S")).pickupGuid).toBeNull()
    expect((await shipment("N")).pickupGuid).toBe(fresh)
  })

  test("a stale reservation does not stop the parcel from being cancelled", async () => {
    const stale = `reserve:${services.now().getTime() - 10 * 60_000}:${crypto.randomUUID()}`
    await db.update(shipments).set({ pickupGuid: stale }).where(eq(shipments.id, ids.R!.shipment))
    await cancelShipment(services, null, ids.R!.shipment, "doublon", carrier)
    expect((await shipment("R")).status).toBe("cancelled")
  })

  test("a reservation left by a crash is cleared, a fresh one still blocks the parcel", async () => {
    const at = (msAgo: number) => `reserve:${services.now().getTime() - msAgo}:${crypto.randomUUID()}`
    await db
      .update(shipments)
      .set({ pickupGuid: at(10 * 60_000) })
      .where(eq(shipments.id, ids.M!.shipment))
    await db
      .update(shipments)
      .set({ pickupGuid: at(1_000) })
      .where(eq(shipments.id, ids.N!.shipment))
    await expect(createPickup(services, { ...window, shipmentIds: [ids.N!.shipment] }, carrier)).rejects.toThrow(
      "déjà dans un enlèvement",
    )
    await createPickup(services, { ...window, shipmentIds: [ids.M!.shipment] }, carrier)
    expect((await shipment("M")).pickupId).toBe("5551")
  })
})
