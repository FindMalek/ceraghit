import { ORPCError } from "@orpc/server"
import { type Db, orderAudit, orderItems, orders, products, productVariants } from "@workspace/db"
import {
  type Currency,
  estimateShipping,
  holdDays,
  type ManualPaymentMethod,
  type OrderInput,
  paymentMethodsFor,
  pick,
} from "@workspace/sdk"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import type { Services } from "../context"
import { orderUrl } from "../emails/order-url"
import { publicError } from "../errors"
import { findProducts } from "./catalog"
import { tryIssueInvoice } from "./invoices"
import { sendOrderEmails, sendOrderExpiredEmail, sendPaymentReceivedEmail } from "./order-emails"
import type { PaymentCheck } from "./payments"
import { unitMinor } from "./pricing"
import { effectivePaymentMethods, getPaymentSettings, getSettings } from "./settings"

/** A pending order holds its stock this long, then the pieces go back on sale. */
export const HOLD_MINUTES = 45

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type OrderStatus = typeof orders.$inferSelect.status

export interface AuditRow {
  orderId: string
  adminId: string | null
  action: "mark_paid_manually" | "set_status" | "gateway_mismatch" | "late_payment" | "hold_expired"
  fromStatus: OrderStatus
  toStatus: OrderStatus
  method?: string | null
  reference?: string | null
  note?: string | null
}

export async function recordAudit(tx: Tx, row: AuditRow): Promise<void> {
  await tx.insert(orderAudit).values({ ...row, createdAt: sql`clock_timestamp()` })
}

/**
 * Once per order and action: the gateway is asked again on every webhook and page load, often at the same time.
 * The advisory lock serialises the not-exists check, since there is no unique key to lean on.
 */
async function recordAuditOnce(db: Db, row: AuditRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order_audit:${row.orderId}:${row.action}`}))`)
    const [existing] = await tx
      .select({ id: orderAudit.id })
      .from(orderAudit)
      .where(and(eq(orderAudit.orderId, row.orderId), eq(orderAudit.action, row.action)))
      .limit(1)
    if (!existing) await tx.insert(orderAudit).values({ ...row, createdAt: sql`clock_timestamp()` })
  })
}

function paymentMatches(order: { totalMinor: number; currency: string; number: string }, check: PaymentCheck): boolean {
  return (
    check.amountMinor === order.totalMinor &&
    (check.currency === null || check.currency === (order.currency as Currency)) &&
    (check.orderNumber === null || check.orderNumber === order.number)
  )
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

/** One lazy sweep (a page load) releases at most this many offline orders; the cron has no such cap. */
export const LAZY_SWEEP_LIMIT = 20

/**
 * Cancels unpaid orders past their hold and puts the pieces back. Card orders hold 45 minutes; transfer and cash on
 * delivery orders hold the days the owner set (never for a method set to null). Each release goes through
 * `cancelOrder` (row lock, restock, audit). It never sends mail: `sendExpiryMails` does, from the cron.
 * `limit` caps the offline releases of one call, `only` (tests) restricts it to those orders.
 */
export async function releaseExpiredHolds(
  services: Services,
  now: Date,
  opts: { limit?: number; only?: string[] } = {},
): Promise<number> {
  const { db } = services
  const { only } = opts
  const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000)
  const online = await db.transaction(async (tx) => {
    const stale = await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(orders.status, "pending_payment"),
          eq(orders.paymentMethod, "online"),
          lt(orders.createdAt, cutoff),
          only ? inArray(orders.id, only) : undefined,
        ),
      )
      .returning({ id: orders.id })
    for (const { id } of stale) await restock(tx, id)
    return stale.length
  })

  const { holds } = await getPaymentSettings(db, services.config)
  let offline = 0
  for (const method of ["transfer", "cod"] as const) {
    const days = holdDays(method, holds)
    if (days === null) continue
    const room = opts.limit === undefined ? undefined : opts.limit - offline
    if (room !== undefined && room <= 0) break
    const due = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.status, "pending_payment"),
          eq(orders.paymentMethod, method),
          lt(orders.createdAt, new Date(now.getTime() - days * 864e5)),
          only ? inArray(orders.id, only) : undefined,
        ),
      )
      .orderBy(orders.createdAt)
      .limit(room ?? 1000)
    for (const { id } of due) {
      const released = await cancelOrder(db, id, "cancelled", {
        adminId: null,
        action: "hold_expired",
        note: `délai de paiement dépassé (${days} j)`,
        onlyPending: true,
      })
      if (released) offline++
    }
  }
  return online + offline
}

/** Tells the customer of every released order not mailed yet. Best effort, called by the cron only. */
export async function sendExpiryMails(services: Services, limit = 50): Promise<number> {
  const { db } = services
  const rows = await db
    .select({ orderId: orderAudit.orderId, note: orderAudit.note })
    .from(orderAudit)
    .where(
      and(
        eq(orderAudit.action, "hold_expired"),
        sql`not exists (select 1 from mail_log m where m.order_id = ${orderAudit.orderId} and m.kind = 'order_expired')`,
      ),
    )
    .orderBy(orderAudit.createdAt)
    .limit(limit)
  for (const { orderId, note } of rows) {
    const days = Number(/\((\d+) j\)/.exec(note ?? "")?.[1] ?? 0)
    await sendOrderExpiredEmail(services, orderId, days)
  }
  return rows.length
}

let lastSweep = 0

/** Catalogue reads free expired holds too, at most once a minute per instance and 20 offline orders at a time. */
export async function sweepExpiredHolds(services: Services, now: Date): Promise<void> {
  if (now.getTime() - lastSweep < 60_000) return
  lastSweep = now.getTime()
  await releaseExpiredHolds(services, now, { limit: LAZY_SWEEP_LIMIT }).catch((error) =>
    console.error("[holds] sweep failed", error),
  )
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
  await releaseExpiredHolds(services, now(), { limit: LAZY_SWEEP_LIMIT })

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

  const payPageUrl = orderUrl(config.webUrl, { ...created, locale: input.locale })
  if (created.paymentMethod === "cod" || created.paymentMethod === "transfer") {
    await db.update(orders).set({ paymentProvider: created.paymentMethod }).where(eq(orders.id, created.id))
    await sendOrderEmails(services, created.id)
    return { number: created.number, token: created.publicToken, payUrl: payPageUrl }
  }

  try {
    const checkout = await payments.init({
      orderNumber: created.number,
      amountMinor: created.totalMinor,
      currency: created.currency,
      customer: { name: created.customerName, email: created.email, phone: created.phone },
      description: `Ceraghit ${created.number}`,
      successUrl: payPageUrl,
      failUrl: payPageUrl,
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
  audit?: { adminId: string | null; action?: AuditRow["action"]; note?: string; onlyPending?: boolean },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for("update")
    const [order] = await tx
      .update(orders)
      .set({ status: to })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.status, audit?.onlyPending ? ["pending_payment"] : ["pending_payment", "paid"]),
        ),
      )
      .returning({ id: orders.id })
    if (!order || !before) return false
    await restock(tx, orderId)
    if (audit) {
      await recordAudit(tx, {
        orderId,
        adminId: audit.adminId,
        action: audit.action ?? "set_status",
        fromStatus: before.status,
        toStatus: to,
        note: audit.note,
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
  if (order.status === "cancelled" && order.paymentMethod === "online") {
    const [seen] = await db
      .select({ id: orderAudit.id })
      .from(orderAudit)
      .where(and(eq(orderAudit.orderId, order.id), eq(orderAudit.action, "late_payment")))
      .limit(1)
    // shortcut: once the row exists the gateway is not asked again
    if (!seen) {
      const late = await payments.check(ref)
      if (late.status === "paid") {
        await recordAuditOnce(db, {
          orderId: order.id,
          adminId: null,
          action: "late_payment",
          fromStatus: "cancelled",
          toStatus: "cancelled",
          note: `paiement reçu après l'annulation : ${late.amountMinor} ${late.currency ?? order.currency} (attendu ${order.totalMinor} ${order.currency})`,
        })
      }
    }
  }
  if (order.status !== "pending_payment") return { number: order.number, status: order.status }

  const check = await payments.check(ref)
  if (check.status === "paid") {
    if (!paymentMatches(order, check)) {
      console.error(`[settle ${order.number}] payment does not match the order`)
      await recordAuditOnce(db, {
        orderId: order.id,
        adminId: null,
        action: "gateway_mismatch",
        fromStatus: "pending_payment",
        toStatus: "pending_payment",
        note: `reçu ${check.amountMinor} ${check.currency ?? "?"} n° ${check.orderNumber ?? "?"}, attendu ${order.totalMinor} ${order.currency} n° ${order.number}`,
      })
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
