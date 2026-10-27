import { ORPCError } from "@orpc/server"
import { type Db, orderItems, orders, products, productVariants } from "@workspace/db"
import { type Currency, estimateShipping, type OrderInput, pick } from "@workspace/sdk"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import type { Services } from "../context"
import { findProducts } from "./catalog"
import { sendOrderEmails } from "./order-emails"
import { unitMinor } from "./pricing"
import { getSettings } from "./settings"

/** A pending order holds its stock this long, then the pieces go back on sale. */
export const HOLD_MINUTES = 45

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function restock(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  for (const item of items) {
    if (item.variantId) {
      await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
        .where(eq(productVariants.id, item.variantId))
    } else if (item.productId) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(eq(products.id, item.productId))
    }
  }
}

/** Cancels unpaid orders past their hold and puts the pieces back. Called lazily, there is no cron on previews. */
export async function releaseExpiredHolds(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000)
  return db.transaction(async (tx) => {
    const stale = await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(
        and(eq(orders.status, "pending_payment"), eq(orders.paymentMethod, "online"), lt(orders.createdAt, cutoff)),
      )
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
  if (input.paymentMethod === "cod" && input.country !== "TN") {
    throw new ORPCError("BAD_REQUEST", { message: "Cash on delivery is only available in Tunisia." })
  }
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
    const variant = item.variantId ? row.variants.find((v) => v.id === item.variantId) : undefined
    if (item.variantId && !variant) {
      throw new ORPCError("NOT_FOUND", { message: "An option in your cart is no longer available." })
    }
    if (!variant && row.variants.length > 0) {
      throw new ORPCError("BAD_REQUEST", { message: `Choose an option for ${row.ref}.` })
    }
    return { row, variant, quantity: item.quantity }
  })

  const settings = await getSettings(db)
  const unit = ({ row, variant }: (typeof lines)[number]) => unitMinor(row, variant, input.currency)
  const subtotal = lines.reduce((sum, l) => sum + unit(l) * l.quantity, 0)
  const quote = estimateShipping(
    settings.shippingRates,
    lines.map(({ row, quantity }) => ({ ...row, quantity })),
    input.country,
    input.currency,
    subtotal,
  )
  if (!quote.available) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This order is too big to ship online, please send a request instead.",
    })
  }
  const shipping = quote.amountMinor
  const total = subtotal + shipping

  const created = await db.transaction(async (tx) => {
    for (const { row, variant, quantity } of lines) {
      const updated = variant
        ? await tx
            .update(productVariants)
            .set({ stock: sql`${productVariants.stock} - ${quantity}` })
            .where(and(eq(productVariants.id, variant.id), sql`${productVariants.stock} >= ${quantity}`))
            .returning({ id: productVariants.id })
        : await tx
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
      paymentMethod: input.paymentMethod,
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const [order] = await tx
        .insert(orders)
        .values({ ...base, number: newNumber() })
        .onConflictDoNothing({ target: orders.number })
        .returning()
      if (!order) continue
      await tx.insert(orderItems).values(
        lines.map((line) => ({
          orderId: order.id,
          productId: line.row.id,
          variantId: line.variant?.id ?? null,
          ref: line.row.ref,
          title: line.variant
            ? `${pick(line.row.title, "fr")} (${pick(line.variant.label, "fr").toLocaleLowerCase("fr")})`
            : pick(line.row.title, "fr"),
          unitMinor: unit(line),
          quantity: line.quantity,
        })),
      )
      return order
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not create the order." })
  })

  const orderUrl = `${config.webUrl}/${input.locale}/order/${created.number}?t=${created.publicToken}`
  if (created.paymentMethod === "cod") {
    await db.update(orders).set({ paymentProvider: "cod" }).where(eq(orders.id, created.id))
    await sendOrderEmails(services, created.id)
    return { number: created.number, token: created.publicToken, payUrl: orderUrl }
  }

  try {
    const checkout = await payments.init({
      orderNumber: created.number,
      amountMinor: created.totalMinor,
      currency: created.currency,
      customer: { name: created.customerName, email: created.email, phone: created.phone },
      description: `Ceraghit ${created.number}`,
      successUrl: orderUrl,
      failUrl: orderUrl,
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
    if (paid) await sendOrderEmails(services, order.id)
    return { number: order.number, status: paid?.status ?? "paid" }
  }
  if (check.status === "failed") {
    await cancelOrder(db, order.id)
    return { number: order.number, status: "cancelled" }
  }
  return { number: order.number, status: order.status }
}
