import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, orders, shipments } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, inArray, like } from "drizzle-orm"

const url = process.env.DATABASE_URL

describe.skipIf(!url)("shipments table", () => {
  const db = createDb(url!)
  const tag = `SH-${Date.now().toString(36)}`
  let seq = 0

  const order = async () => {
    const [row] = await db
      .insert(orders)
      .values({
        number: `${tag}-${seq++}`,
        publicToken: "t",
        status: "paid",
        paymentMethod: "transfer",
        currency: "TND",
        subtotalMinor: 50_000,
        totalMinor: 50_000,
        customerName: "Ship Buyer",
        email: "shipments@example.test",
        phone: "+21620000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue du test",
        locale: "fr",
      })
      .returning({ id: orders.id })
    return row!.id
  }
  /** The Postgres error code and constraint, whichever way the driver wraps the error. */
  const pgError = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (error) {
      const e = error as {
        code?: string
        constraint_name?: string
        cause?: { code?: string; constraint_name?: string }
      }
      return { code: e.code ?? e.cause?.code, constraint: e.constraint_name ?? e.cause?.constraint_name }
    }
    return null
  }
  const shipment = async (orderId: string, waybill: string, over: Partial<typeof shipments.$inferInsert> = {}) => {
    await db.insert(shipments).values({
      orderId,
      provider: "aramex",
      environment: "fake",
      waybill,
      productGroup: "DOM",
      productType: "ONP",
      currency: "TND",
      weightGrams: 1500,
      ...over,
    })
  }

  beforeAll(() => runMigrations(db))
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

  test("a new shipment starts as created with no events", async () => {
    const id = await order()
    await shipment(id, `${tag}-W1`)
    const [row] = await db.select().from(shipments).where(eq(shipments.orderId, id))
    expect(row).toMatchObject({ status: "created", pieces: 1, events: [], errors: [], codAmountMinor: null })
  })

  test("an order has one active shipment, a new one is allowed once the first is cancelled", async () => {
    const id = await order()
    await shipment(id, `${tag}-W2`)
    expect(await pgError(() => shipment(id, `${tag}-W3`))).toEqual({
      code: "23505",
      constraint: "shipments_active_order_idx",
    })
    await db
      .update(shipments)
      .set({ status: "cancelled" })
      .where(eq(shipments.waybill, `${tag}-W2`))
    await shipment(id, `${tag}-W3`)
    expect((await db.select().from(shipments).where(eq(shipments.orderId, id))).length).toBe(2)
  })

  test("a waybill belongs to one shipment", async () => {
    await shipment(await order(), `${tag}-W4`)
    const other = await order()
    expect(await pgError(() => shipment(other, `${tag}-W4`))).toEqual({
      code: "23505",
      constraint: "shipments_waybill_idx",
    })
  })

  test("an order that has a shipment cannot be deleted", async () => {
    const id = await order()
    await shipment(id, `${tag}-W5`)
    expect(await pgError(async () => db.delete(orders).where(eq(orders.id, id)))).toEqual({
      code: "23503",
      constraint: "shipments_order_id_orders_id_fk",
    })
  })
})
