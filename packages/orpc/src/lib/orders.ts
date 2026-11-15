import { ORPCError } from "@orpc/server"
import { type Db, orderAudit, orderItems, orders, products, productVariants } from "@workspace/db"
import {
  type Currency,
  estimateShipping,
  type ManualPaymentMethod,
  type OrderInput,
  paymentMethodsFor,
  pick,
} from "@workspace/sdk"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import type { Services } from "../context"
import { publicError } from "../errors"
import { findProducts } from "./catalog"
import { tryIssueInvoice } from "./invoices"
import { sendOrderEmails, sendPaymentReceivedEmail } from "./order-emails"
import { unitMinor } from "./pricing"
import { effectivePaymentMethods, getSettings } from "./settings"

/** A pending order holds its stock this long, then the pieces go back on sale. */
export const HOLD_MINUTES = 45

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type OrderStatus = typeof orders.$inferSelect.status

export interface AuditRow {
  orderId: string
  adminId: string | null
  action: "mark_paid_manually" | "set_status"
  fromStatus: OrderStatus
  toStatus: OrderStatus
  method?: string | null
  reference?: string | null
  note?: string | null
}

export async function recordAudit(tx: Tx, row: AuditRow): Promise<void> {
  await tx.insert(orderAudit).values(row)
}

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

let lastSweep = 0

/** Catalogue reads free expired holds too (there is no cron), at most once a minute per instance. */
export async function sweepExpiredHolds(db: Db, now: Date): Promise<void> {
  if (now.getTime() - lastSweep < 60_000) return
  lastSweep = now.getTime()
  await releaseExpiredHolds(db, now).catch((error) => console.error("[holds] sweep failed", error))
}

function newNumber(): string {
  return `CER-${Math.floor(10_000 + Math.random() * 90_000)}`
}

export async function createOrder(services: Services, input: OrderInput) {
  const { db, payments, config, now } = services
  const allowed = paymentMethodsFor(input, await effectivePaymentMethods(services), true)
  if (allowed.length === 0) {
    throw publicError(
      "PRECONDITION_FAILED",
      "country_unavailable",
      "Orders from your country are not available right now. Please contact us.",
    )
  }
  const method = input.paymentMethod ?? allowed[0]
  if (!method || !allowed.includes(method)) {
    throw publicError(
      "BAD_REQUEST",
      "payment_method_unavailable",
      "This payment method is not available for your country.",
    )
  }
  await releaseExpiredHolds(db, now())

  const ids = [...new Set(input.items.map((i) => i.productId))]
  const rows = await findProducts(db, {
    where: (p, { and, eq, inArray }) => and(inArray(p.id, ids), eq(p.status, "published")),
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const lines = input.items.map((item) => {
    const row = byId.get(item.productId)
    if (!row) throw publicError("NOT_FOUND", "piece_unavailable", "A piece in your cart is no longer available.")
    if (row.quoteOnly)
      throw publicError("BAD_REQUEST", "piece_quote_only", `${row.ref} is sold on quote, send a request instead.`)
    if (row.unique && item.quantity > 1)
      throw publicError("BAD_REQUEST", "piece_unique", `${row.ref} is a unique piece.`)
    const variant = item.variantId ? row.variants.find((v) => v.id === item.variantId) : undefined
    if (item.variantId && !variant) {
      throw publicError("NOT_FOUND", "option_unavailable", "An option in your cart is no longer available.")
    }
    if (!variant && row.variants.length > 0) {
      throw publicError("BAD_REQUEST", "option_required", `Choose an option for ${row.ref}.`)
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
    throw publicError(
      "BAD_REQUEST",
      "order_too_big",
      "This order is too big to ship online, please send a request instead.",
    )
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
        throw publicError("CONFLICT", "out_of_stock", `${pick(row.title, input.locale)} is no longer in stock.`)
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
      paymentMethod: method,
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
    throw publicError("INTERNAL_SERVER_ERROR", "order_failed", "Could not create the order.")
  })

  const orderUrl = `${config.webUrl}/${input.locale}/order/${created.number}?t=${created.publicToken}`
  if (created.paymentMethod === "cod" || created.paymentMethod === "transfer") {
    await db.update(orders).set({ paymentProvider: created.paymentMethod }).where(eq(orders.id, created.id))
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

/**
 * Cancels an order that has not shipped and returns its pieces to stock. Safe to call twice.
 * `audit` is written in the same transaction when the admin did it.
 */
export async function cancelOrder(
  db: Db,
  orderId: string,
  to: "cancelled" | "refunded" = "cancelled",
  audit?: { adminId: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for("update")
    const [order] = await tx
      .update(orders)
      .set({ status: to })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["pending_payment", "paid"])))
      .returning({ id: orders.id })
    if (!order || !before) return false
    await restock(tx, orderId)
    if (audit) {
      await recordAudit(tx, {
        orderId,
        adminId: audit.adminId,
        action: "set_status",
        fromStatus: before.status,
        toStatus: to,
      })
    }
    return true
  })
}

/**
 * The owner confirms a payment the gateway never sees (bank transfer, Payoneer link, cash). Admin only, never
 * called from a public procedure. One guarded update plus one audit row, so a double click pays and mails once.
 */
export async function markPaidManually(
  services: Services,
  input: {
    orderId: string
    adminId: string
    method: ManualPaymentMethod
    reference: string | null
    note: string | null
    expectedTotalMinor: number
    expectedCurrency: Currency
  },
): Promise<{ status: "paid"; alreadyPaid: boolean }> {
  const { db, now } = services
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1)
  if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
  if (order.paymentMethod === "online") {
    throw new ORPCError("BAD_REQUEST", { message: "Card payments are confirmed by the gateway only." })
  }
  if (order.totalMinor !== input.expectedTotalMinor || order.currency !== input.expectedCurrency) {
    throw new ORPCError("CONFLICT", { message: "The amount changed, reload the order." })
  }

  const paid = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set({ status: "paid", paidAt: now(), paymentProvider: sql`coalesce(${orders.paymentProvider}, 'manual')` })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment")))
      .returning({ id: orders.id })
    if (!row) return false
    await recordAudit(tx, {
      orderId: order.id,
      adminId: input.adminId,
      action: "mark_paid_manually",
      fromStatus: "pending_payment",
      toStatus: "paid",
      method: input.method,
      reference: input.reference,
      note: input.note,
    })
    return true
  })

  if (!paid) {
    const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).limit(1)
    if (current?.status === "paid" || current?.status === "fulfilled") return { status: "paid", alreadyPaid: true }
    throw new ORPCError("BAD_REQUEST", { message: "This order cannot be marked paid." })
  }
  await tryIssueInvoice(db, order.id, now())
  await sendPaymentReceivedEmail(services, order.id)
  return { status: "paid", alreadyPaid: false }
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
    if (paid) {
      await tryIssueInvoice(db, order.id, now())
      await sendOrderEmails(services, order.id)
    }
    return { number: order.number, status: paid?.status ?? "paid" }
  }
  if (check.status === "failed") {
    await cancelOrder(db, order.id)
    return { number: order.number, status: "cancelled" }
  }
  return { number: order.number, status: order.status }
}
