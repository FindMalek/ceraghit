import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import {
  admins,
  createDb,
  integrationCredentials,
  invoices,
  orderItems,
  orders,
  settings,
  shipments,
  uploads,
} from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { protectedKeys } from "../src/lib/cleanup"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { parseKeyring } from "../src/lib/secrets"
import { createFakeAramexFetch } from "../src/lib/shipping/aramex/fake"
import type { Storage } from "../src/lib/storage"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const EMAIL = "shipments-owner@test.local"
const KEY = `1:${Buffer.alloc(32, 1).toString("base64")}`
const config = {
  mode: "test" as const,
  userName: "shop@example.test",
  accountNumber: "20016",
  accountEntity: "TUN",
  accountCountryCode: "TN",
}

describe.skipIf(!url)("aramex shipments", () => {
  const db = createDb(url!)
  const tag = `SHP-${Date.now().toString(36)}`
  let seq = 0
  const sent: { url: string; body: string }[] = []
  const puts: { key: string; type: string; bytes: number }[] = []
  let failPut = false
  const shipped: string[] = []
  const fake = createFakeAramexFetch()
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: String(init?.body ?? "") })
    return fake(input, init)
  }) as typeof fetch
  const storage = {
    bucket: "b",
    prefix: "pr-7/",
    put: async (key: string, body: Uint8Array, type: string) => {
      if (failPut) throw new Error("bucket down")
      puts.push({ key, type, bytes: body.length })
    },
    signedGet: async (key: string, _s?: number, filename?: string) =>
      `https://bucket.test/${key}?X-Amz-Signature=x&name=${filename}`,
  } as unknown as Storage
  const base: Services = {
    db,
    payments: new DemoProvider("https://web.test"),
    mailer: new ConsoleMailer(),
    storage,
    auth: new AdminAuth(db),
    secrets: parseKeyring(KEY),
    http,
    hooks: { orderShipped: async (id) => void shipped.push(id) },
    now: () => new Date(),
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "preview",
      deployEnv: "pr-7",
      secureCookies: false,
      onlinePayments: false,
      aramexFake: true,
    },
  }
  let token = ""
  const owner = () =>
    createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(base, new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" })),
    })

  const order = async (over: Partial<typeof orders.$inferInsert> = {}, quantity = 1) => {
    const [row] = await db
      .insert(orders)
      .values({
        number: `${tag}-${seq++}`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 80_000,
        totalMinor: 90_000,
        customerName: "Demo Buyer",
        email: "demo-buyer@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Sousse",
        address: "1 rue du test",
        locale: "fr",
        ...over,
      })
      .returning({ id: orders.id })
    await db.insert(orderItems).values({ orderId: row!.id, ref: "VASE-1", title: "Vase", unitMinor: 80_000, quantity })
    return row!.id
  }
  const draftFor = async (orderId: string) => {
    const draft = await owner().shipping.draft({ orderId })
    return {
      orderId,
      consignee: draft.consignee,
      parcel: draft.parcel,
      description: draft.description,
      fragile: draft.fragile,
      insurance: null,
    }
  }

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: EMAIL, password: "clay-test-pass" } })
    token = (await base.auth.login("127.0.0.1", EMAIL, "clay-test-pass"))!.token
    await owner().shipping.saveSettings({
      mode: { provider: "aramex", quoteFromProvider: false },
      aramex: { config, secrets: { password: "fake-password", accountPin: "fake-pin-1234" } },
    })
  })
  afterAll(async () => {
    const mine = await db
      .select({ id: orders.id })
      .from(orders)
      .where(like(orders.number, `${tag}%`))
    for (const { id } of mine) {
      await db.delete(shipments).where(eq(shipments.orderId, id))
      await db.delete(invoices).where(eq(invoices.orderId, id))
    }
    await db.delete(orders).where(like(orders.number, `${tag}%`))
    await db.delete(uploads).where(like(uploads.key, "pr-7/private/%"))
    await db.delete(integrationCredentials).where(eq(integrationCredentials.provider, "aramex"))
    await db.delete(settings).where(eq(settings.key, "shipping"))
    await db.delete(admins).where(eq(admins.email, EMAIL))
  })

  test("a paid order gets a waybill, a private label and ships once", async () => {
    const id = await order()
    const before = shipped.length
    const { shipmentId, waybill } = await owner().shipping.createShipment(await draftFor(id))
    expect(waybill).toStartWith("FAKE")
    const [row] = await db.select().from(shipments).where(eq(shipments.id, shipmentId))
    expect(row).toMatchObject({ environment: "fake", productGroup: "DOM", codAmountMinor: null, currency: "TND" })
    expect(row?.labelKey).toStartWith("pr-7/private/labels/")
    expect(puts.at(-1)).toMatchObject({ key: row?.labelKey, type: "application/pdf" })
    expect(await db.select().from(uploads).where(eq(uploads.key, row!.labelKey!))).toHaveLength(1)
    const [after] = await db.select().from(orders).where(eq(orders.id, id))
    expect(after).toMatchObject({ status: "fulfilled", carrier: "aramex", trackingNumber: waybill })
    expect(shipped.length - before).toBe(1)
    const view = await owner().shipping.shipmentOf({ orderId: id })
    expect(view?.hasLabel).toBe(true)
    expect(JSON.stringify(view)).not.toContain("private/")
    const { url: link } = await owner().shipping.labelUrl({ id: shipmentId })
    expect(link).toContain(`${row!.labelKey}?X-Amz-Signature`)
    expect(link).toContain(`name=${waybill}.pdf`)
  })

  test("a second shipment for the same order is refused", async () => {
    const id = await order()
    const input = await draftFor(id)
    await owner().shipping.createShipment(input)
    await expect(owner().shipping.createShipment(input)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const [row] = await db.select().from(orders).where(eq(orders.id, id))
    expect(row?.status).toBe("fulfilled")
    expect(await db.select().from(shipments).where(eq(shipments.orderId, id))).toHaveLength(1)
  })

  test("two creates at once for the same order make one shipment", async () => {
    const id = await order()
    const input = await draftFor(id)
    sent.length = 0
    const results = await Promise.allSettled([
      owner().shipping.createShipment(input),
      owner().shipping.createShipment(input),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(sent.filter((c) => c.url.endsWith("/CreateShipments"))).toHaveLength(1)
    expect(await db.select().from(shipments).where(eq(shipments.orderId, id))).toHaveLength(1)
  })

  test("a create that finds a shipment made while it waited for the claim stops before Aramex", async () => {
    const id = await order()
    const input = await draftFor(id)
    let raced = false
    // The other request finishes right when this one is about to claim the order.
    const racing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "delete") return Reflect.get(target, prop, receiver)
        return (...args: Parameters<typeof db.delete>) => ({
          where: (...cond: Parameters<ReturnType<typeof db.delete>["where"]>) => {
            const query = target.delete(...args).where(...cond)
            return (async () => {
              if (!raced) {
                raced = true
                await db.insert(shipments).values({
                  orderId: id,
                  provider: "aramex",
                  environment: "fake",
                  waybill: `FAKE${crypto.randomUUID().slice(0, 8)}`,
                  productGroup: "DOM",
                  productType: "ONP",
                  currency: "TND",
                  weightGrams: 1000,
                })
              }
              return query
            })()
          },
        })
      },
    })
    const client = createRouterClient(adminRouter, {
      context: (): Context =>
        createContext(
          { ...base, db: racing as typeof db },
          new Headers({ cookie: `ceraghit_admin=${token}`, "x-csrf-token": "orpc" }),
        ),
    })
    sent.length = 0
    await expect(client.shipping.createShipment(input)).rejects.toMatchObject({ code: "CONFLICT" })
    expect(raced).toBe(true)
    expect(sent.filter((c) => c.url.endsWith("/CreateShipments"))).toHaveLength(0)
  })

  test("a consignee country that differs from the order is refused before Aramex", async () => {
    const id = await order()
    const input = await draftFor(id)
    sent.length = 0
    await expect(
      owner().shipping.createShipment({ ...input, consignee: { ...input.consignee, country: "FR" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(sent).toHaveLength(0)
  })

  test("a parcel over the carrier limits gives a blocked draft, not a capped one", async () => {
    const id = await order({}, 40)
    const draft = await owner().shipping.draft({ orderId: id })
    expect(draft.parcel.weightGrams).toBeGreaterThan(30_000)
    expect(draft.blocked).toContain("30 kg")
  })

  test("cash on delivery in Tunisia asks Aramex to collect the total in dinars and counts the sale", async () => {
    const id = await order({ status: "pending_payment", paymentMethod: "cod" })
    sent.length = 0
    await owner().shipping.createShipment(await draftFor(id))
    const call = sent.find((c) => c.url.endsWith("/CreateShipments"))
    const body = JSON.parse(call!.body)
    expect(body.Shipments[0].Details.Services).toContain("CODS")
    expect(body.Shipments[0].Details.CashOnDeliveryAmount).toEqual({ CurrencyCode: "TND", Value: 90 })
    const [row] = await db.select().from(orders).where(eq(orders.id, id))
    expect(row?.paidAt).not.toBeNull()
    const [ship] = await db.select().from(shipments).where(eq(shipments.orderId, id))
    expect(ship?.codAmountMinor).toBe(90_000)
  })

  test("cash on delivery in euros never reaches Aramex", async () => {
    const id = await order({ status: "pending_payment", paymentMethod: "cod", currency: "EUR" })
    sent.length = 0
    const input = await draftFor(id)
    await expect(owner().shipping.createShipment(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Le paiement à la livraison n'existe qu'en Tunisie.",
    })
    expect(sent).toHaveLength(0)
  })

  test("an Aramex refusal writes no shipment and leaves the order alone", async () => {
    const id = await order({ number: `${tag}-${seq++}-FAKE-REFUSED` })
    await expect(owner().shipping.createShipment(await draftFor(id))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Consignee city is not valid"),
    })
    expect(await db.select().from(shipments).where(eq(shipments.orderId, id))).toHaveLength(0)
    const [row] = await db.select().from(orders).where(eq(orders.id, id))
    expect(row?.status).toBe("paid")
  })

  test("a label that cannot be stored keeps the shipment and can be fetched again", async () => {
    const id = await order()
    const reservedBefore = (await db.select().from(uploads).where(like(uploads.key, "pr-7/private/%"))).length
    failPut = true
    const { shipmentId } = await owner().shipping.createShipment(await draftFor(id))
    failPut = false
    expect(await db.select().from(uploads).where(like(uploads.key, "pr-7/private/%"))).toHaveLength(reservedBefore)
    const view = await owner().shipping.shipmentOf({ orderId: id })
    expect(view).toMatchObject({ hasLabel: false, errors: [{ code: "LABEL" }] })
    await expect(owner().shipping.labelUrl({ id: shipmentId })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await owner().shipping.retryLabel({ id: shipmentId })
    expect(await owner().shipping.shipmentOf({ orderId: id })).toMatchObject({ hasLabel: true, errors: [] })
  })

  test("the storage cleanup keeps the label of an open parcel and drops it 90 days after delivery", async () => {
    const day = 86_400_000
    const mk = async (status: "in_transit" | "delivered", ageDays: number) => {
      const id = await order({ status: "fulfilled" })
      const key = `pr-7/private/labels/${crypto.randomUUID()}.pdf`
      const at = new Date(Date.now() - ageDays * day)
      await db.insert(shipments).values({
        orderId: id,
        provider: "aramex",
        environment: "fake",
        waybill: `FAKE${crypto.randomUUID().slice(0, 8)}`,
        productGroup: "DOM",
        productType: "ONP",
        status,
        currency: "TND",
        weightGrams: 1000,
        labelKey: key,
        createdAt: at,
        deliveredAt: status === "delivered" ? at : null,
      })
      return key
    }
    const open = await mk("in_transit", 40)
    const recent = await mk("delivered", 30)
    const old = await mk("delivered", 100)
    const keys = await protectedKeys(db)
    expect(keys.has(open)).toBe(true)
    expect(keys.has(recent)).toBe(true)
    expect(keys.has(old)).toBe(false)
  })
})
