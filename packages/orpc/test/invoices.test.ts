import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createDb, invoiceCounters, invoices, orders, shopProfile } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { eq, inArray, like } from "drizzle-orm"
import { issueInvoice } from "../src/lib/invoices"
import { getShopProfile, updateShopProfile } from "../src/lib/shop-profile"

const url = process.env.DATABASE_URL
const YEARS = [2091, 2092, 2093, 2094]
const at = (iso: string) => new Date(iso)

describe.skipIf(!url)("invoices", () => {
  const db = createDb(url!)
  let seq = 0

  const order = async (status: "pending_payment" | "paid" | "fulfilled" | "cancelled" = "paid") => {
    const [row] = await db
      .insert(orders)
      .values({
        number: `TST-INV-${Date.now()}-${seq++}`,
        publicToken: "t",
        status,
        currency: "TND",
        subtotalMinor: 1000,
        totalMinor: 1000,
        customerName: "Test",
        email: "client@example.test",
        phone: "20000000",
        country: "TN",
        city: "Tunis",
        address: "1 rue Test",
      })
      .returning()
    return row!
  }

  beforeAll(async () => {
    await runMigrations(db)
  })

  afterAll(async () => {
    const mine = await db.select({ id: orders.id }).from(orders).where(like(orders.number, "TST-INV-%"))
    await db.delete(invoices).where(
      inArray(
        invoices.orderId,
        mine.map((o) => o.id),
      ),
    )
    await db.delete(invoiceCounters).where(inArray(invoiceCounters.year, YEARS))
    await db.delete(orders).where(like(orders.number, "TST-INV-%"))
  })

  test("concurrent issues get consecutive numbers and issuing twice returns the same one", async () => {
    const [a, b] = [await order(), await order()]
    const now = at("2091-06-01T10:00:00Z")
    const [ia, ib] = await Promise.all([issueInvoice(db, a.id, now), issueInvoice(db, b.id, now)])
    expect([ia.number, ib.number].sort()).toEqual(["2091-0001", "2091-0002"])
    expect((await issueInvoice(db, a.id, now)).number).toBe(ia.number)
    const [again] = await Promise.all([issueInvoice(db, b.id, now), issueInvoice(db, b.id, now)])
    expect(again.number).toBe(ib.number)
  })

  test("unpaid and cancelled orders get no invoice", async () => {
    for (const status of ["pending_payment", "cancelled"] as const) {
      const o = await order(status)
      await expect(issueInvoice(db, o.id, at("2092-01-10T10:00:00Z"))).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      })
    }
    expect(await db.select().from(invoices).where(eq(invoices.year, 2092))).toEqual([])
  })

  test("an order cancelled while the invoice waits on its lock gets no invoice and burns no number", async () => {
    const o = await order("paid")
    let release!: () => void
    const held = new Promise<void>((r) => {
      release = r
    })
    let locked!: () => void
    const ready = new Promise<void>((r) => {
      locked = r
    })
    const canceller = db.transaction(async (tx) => {
      await tx.select().from(orders).where(eq(orders.id, o.id)).for("update")
      locked()
      await held
      await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id))
    })
    await ready
    const issuing = issueInvoice(db, o.id, at("2093-03-01T10:00:00Z"))
    const outcome = issuing.then(
      () => "issued",
      (e: { code?: string }) => e.code,
    )
    await new Promise((r) => setTimeout(r, 200))
    release()
    await canceller
    expect(await outcome).toBe("PRECONDITION_FAILED")
    expect(await db.select().from(invoices).where(eq(invoices.orderId, o.id))).toEqual([])
    expect(await db.select().from(invoiceCounters).where(eq(invoiceCounters.year, 2093))).toEqual([])
  })

  test("the seller is frozen at issue time and numbers restart each year", async () => {
    const original = await getShopProfile(db)
    try {
      await updateShopProfile(db, { legalName: "Avant SARL", taxId: "1111111A" })
      const first = await issueInvoice(db, (await order("fulfilled")).id, at("2093-12-31T10:00:00Z"))
      await updateShopProfile(db, { legalName: "Après SARL", taxId: "2222222B" })
      const reread = await db.query.invoices.findFirst({ where: eq(invoices.id, first.id) })
      expect(reread?.seller).toMatchObject({ legalName: "Avant SARL", taxId: "1111111A" })
      // 2093-12-31T23:30Z is already 2094-01-01 in Tunis (UTC+1)
      const next = await issueInvoice(db, (await order()).id, at("2093-12-31T23:30:00Z"))
      expect(first.number).toBe("2093-0001")
      expect(next.number).toBe("2094-0001")
      await db.delete(invoiceCounters).where(eq(invoiceCounters.year, 2094))
    } finally {
      await db.delete(shopProfile)
      await db.insert(shopProfile).values(original)
    }
  })
})
