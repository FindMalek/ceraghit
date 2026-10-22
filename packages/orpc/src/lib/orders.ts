import { ORPCError } from "@orpc/server"
import { type Db, orderItems, orders, products } from "@workspace/db"
import { type Currency, estimateShipping, type OrderInput, pick } from "@workspace/sdk"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import type { Services } from "../context"
import { findProducts } from "./catalog"
import { getSettings } from "./settings"

/** A pending order holds its stock this long, then the pieces go back on sale. */
export const HOLD_MINUTES = 45

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function restock(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  for (const item of items) {
    if (!item.productId) continue
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${item.quantity}` })
      .where(eq(products.id, item.productId))
  }
}

/** Cancels unpaid orders past their hold and puts the pieces back. Called lazily, there is no cron on previews. */
export async function releaseExpiredHolds(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000)
  return db.transaction(async (tx) => {
    const stale = await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.status, "pending_payment"), lt(orders.createdAt, cutoff)))
      .returning({ id: orders.id })
    for (const { id } of stale) await restock(tx, id)
    return stale.length
  })
}

function newNumber(): string {
  return `CER-${Math.floor(10_000 + Math.random() * 90_000)}`
}

export async function createOrder(services: Services, input: OrderInput) {
  const { db, payments, config, now } = services
  await releaseExpiredHolds(db, now())

  const ids = [...new Set(input.items.map((i) => i.productId))]
  const rows = await findProducts(db, {
    where: (p, { and, eq, inArray }) => and(inArray(p.id, ids), eq(p.status, "published")),
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const lines = input.items.map((item) => {
    const row = byId.get(item.productId)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "A piece in your cart is no longer available." })
    if (row.quoteOnly)
      throw new ORPCError("BAD_REQUEST", { message: `${row.ref} is sold on quote, send a request instead.` })
    if (row.unique && item.quantity > 1)
      throw new ORPCError("BAD_REQUEST", { message: `${row.ref} is a unique piece.` })
    return { row, quantity: item.quantity }
  })

  const settings = await getSettings(db)
  const unit = (row: (typeof lines)[number]["row"]) => (input.currency === "TND" ? row.priceTnd : row.priceEur)
  const subtotal = lines.reduce((sum, l) => sum + unit(l.row) * l.quantity, 0)
  const quote = estimateShipping(
    settings.shippingRates,
    lines.map(({ row, quantity }) => ({ ...row, quantity })),
    input.country,
    input.currency,
  )
  if (!quote.available) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This order is too big to ship online, please send a request instead.",
    })
  }
  const shipping = quote.amountMinor
  const total = subtotal + shipping

  const created = await db.transaction(async (tx) => {
    for (const { row, quantity } of lines) {
      const updated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${quantity}` })
        .where(and(eq(products.id, row.id), sql`${products.stock} >= ${quantity}`))
        .returning({ id: products.id })
      if (!updated.length) {
        throw new ORPCError("CONFLICT", { message: `${pick(row.title, input.locale)} is no longer in stock.` })
      }
    }
    const publicToken = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url")
    const base = {
      publicToken,
      currency: input.currency,
      subtotalMinor: subtotal,
      shippingMinor: shipping,
      totalMinor: total,
      customerName: input.customerName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      country: input.country,
      city: input.city,
      address: input.address,
      postalCode: input.postalCode,
      note: input.note,
      locale: input.locale,
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const [order] = await tx
        .insert(orders)
        .values({ ...base, number: newNumber() })
        .onConflictDoNothing({ target: orders.number })
        .returning()
      if (!order) continue
      await tx.insert(orderItems).values(
        lines.map(({ row, quantity }) => ({
          orderId: order.id,
          productId: row.id,
          ref: row.ref,
          title: pick(row.title, "fr"),
          unitMinor: unit(row),
          quantity,
        })),
      )
      return order
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not create the order." })
  })

  try {
    const checkout = await payments.init({
      orderNumber: created.number,
      amountMinor: created.totalMinor,
      currency: created.currency,
      customer: { name: created.customerName, email: created.email, phone: created.phone },
      description: `Ceraghit ${created.number}`,
      successUrl: `${config.webUrl}/${input.locale}/order/${created.number}?t=${created.publicToken}`,
      failUrl: `${config.webUrl}/${input.locale}/order/${created.number}?t=${created.publicToken}`,
      webhookUrl: `${config.apiPublicUrl}/webhooks/${payments.name}`,
    })
    await db
      .update(orders)
      .set({ paymentProvider: payments.name, paymentRef: checkout.ref })
      .where(eq(orders.id, created.id))
    return { number: created.number, token: created.publicToken, payUrl: checkout.payUrl }
  } catch (error) {
    await cancelOrder(db, created.id)
    throw error
  }
}

/** Cancels an order that has not shipped and returns its pieces to stock. Safe to call twice. */
export async function cancelOrder(
  db: Db,
  orderId: string,
  to: "cancelled" | "refunded" = "cancelled",
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .update(orders)
      .set({ status: to })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["pending_payment", "paid"])))
      .returning({ id: orders.id })
    if (!order) return false
    await restock(tx, orderId)
    return true
  })
}

/**
 * Asks the gateway what happened to a payment and updates the order to match. Webhooks are unsigned, so this is
 * the only place an order becomes paid: the amount, currency and order number must all match what we created.
 */
export async function settleOrder(services: Services, ref: string): Promise<{ number: string; status: string } | null> {
  const { db, payments, now } = services
  const [order] = await db.select().from(orders).where(eq(orders.paymentRef, ref)).limit(1)
  if (!order) return null
  if (order.status !== "pending_payment") return { number: order.number, status: order.status }

  const check = await payments.check(ref)
  if (check.status === "paid") {
    const matches =
      check.amountMinor === order.totalMinor &&
      (check.currency === null || check.currency === (order.currency as Currency)) &&
      (check.orderNumber === null || check.orderNumber === order.number)
    if (!matches) {
      console.error(`[settle ${order.number}] payment does not match the order`, check)
      return { number: order.number, status: order.status }
    }
    const [paid] = await db
      .update(orders)
      .set({ status: "paid", paidAt: now() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment")))
      .returning({ status: orders.status })
    return { number: order.number, status: paid?.status ?? "paid" }
  }
  if (check.status === "failed") {
    await cancelOrder(db, order.id)
    return { number: order.number, status: "cancelled" }
  }
  return { number: order.number, status: order.status }
}
