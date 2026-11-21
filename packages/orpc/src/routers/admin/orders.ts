import { ORPCError } from "@orpc/server"
import { admins, customRequests, type Db, orderAudit, orders } from "@workspace/db"
import {
  adminOrderSchema,
  type CarrierId,
  carrierIdSchema,
  currencySchema,
  customRequestSchema,
  type HoldSettings,
  holdExpiresAt,
  holdExpiresSoon,
  manualPaymentMethodSchema,
  orderAuditSchema,
  orderExportInputSchema,
  orderListQuerySchema,
  orderStatusSchema,
  type PaymentMethod,
  requestStatusSchema,
} from "@workspace/sdk"
import { and, asc, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm"
import { z } from "zod"
import { tryIssueInvoice } from "../../lib/invoices"
import {
  cancelOrder,
  LAZY_SWEEP_LIMIT,
  markPaidManually,
  paymentLinkDates,
  paymentReferences,
  recordAudit,
  releaseExpiredHolds,
  setPaymentLink,
} from "../../lib/orders"
import { getPaymentSettings } from "../../lib/settings"
import { markOrderShipped, toShipping, updateOrderTracking } from "../../lib/shipping-events"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

type OrderRow = typeof orders.$inferSelect & {
  items: { ref: string; title: string; unitMinor: number; quantity: number }[]
}

interface OrderExtras {
  references: Map<string, string>
  linkDates: Map<string, Date>
}

async function loadExtras(db: Db, rows: { id: string }[]): Promise<OrderExtras> {
  const ids = rows.map((r) => r.id)
  const [references, linkDates] = await Promise.all([paymentReferences(db, ids), paymentLinkDates(db, ids)])
  return { references, linkDates }
}

function toAdminOrder(o: OrderRow, holds: HoldSettings, now: Date, extras: OrderExtras) {
  const payoneer = o.paymentMethod === "payoneer"
  const expires = o.status === "pending_payment" ? holdExpiresAt(o, holds) : null
  return {
    holdExpiresAt: expires?.toISOString() ?? null,
    holdWarning: expires ? holdExpiresSoon(expires, now, holds) : false,
    id: o.id,
    number: o.number,
    paymentMethod: o.paymentMethod as PaymentMethod,
    status: o.status,
    currency: o.currency,
    subtotalMinor: o.subtotalMinor,
    shippingMinor: o.shippingMinor,
    totalMinor: o.totalMinor,
    items: o.items.map(({ ref, title, unitMinor, quantity }) => ({ ref, title, unitMinor, quantity })),
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    customerName: o.customerName,
    email: o.email,
    phone: o.phone,
    country: o.country,
    city: o.city,
    address: o.address,
    postalCode: o.postalCode,
    note: o.note,
    locale: o.locale,
    paymentProvider: o.paymentProvider,
    paymentRef: payoneer ? null : o.paymentRef,
    paymentLink: payoneer ? o.paymentRef : null,
    paymentLinkSetAt: payoneer ? (extras.linkDates.get(o.id)?.toISOString() ?? null) : null,
    paymentReference: extras.references.get(o.id) ?? null,
    shipping: toShipping(o),
  }
}

const shipFields = {
  id: z.string(),
  carrier: carrierIdSchema,
  carrierName: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(60).optional(),
  trackingUrl: z.url().max(500).optional(),
}
const needsCarrierName = (v: { carrier: string; carrierName?: string }) => v.carrier !== "other" || !!v.carrierName
const carrierNameIssue = { message: "Indiquez le nom du transporteur.", path: ["carrierName"] }

/** A studio day in Africa/Tunis (UTC+1, no daylight saving) as a UTC instant. */
const tunisDayStart = (day: string, plus = 0) => new Date(new Date(`${day}T00:00:00+01:00`).getTime() + plus * 864e5)

export const ordersRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/orders", summary: "Orders, newest first", tags: TAG })
    .input(orderListQuerySchema)
    .output(z.array(adminOrderSchema))
    .handler(async ({ context, input }) => {
      await releaseExpiredHolds(context, context.now(), { limit: LAZY_SWEEP_LIMIT })
      const { holds } = await getPaymentSettings(context.db, context.config)
      const search = input.q ? `%${input.q.replace(/[%_]/g, "")}%` : null
      const rows = await context.db.query.orders.findMany({
        where: and(
          input.status ? eq(orders.status, input.status) : undefined,
          search
            ? or(ilike(orders.number, search), ilike(orders.customerName, search), ilike(orders.email, search))
            : undefined,
        ),
        with: { items: true },
        orderBy: [desc(orders.createdAt)],
        limit: input.limit,
      })
      const extras = await loadExtras(context.db, rows)
      return rows.map((row) => toAdminOrder(row, holds, context.now(), extras))
    }),

  get: adminProcedure
    .route({ method: "GET", path: "/admin/orders/{id}", summary: "One order, for its invoice", tags: TAG })
    .input(z.object({ id: z.string() }))
    .output(adminOrderSchema)
    .handler(async ({ context, input }) => {
      const order = await context.db.query.orders.findFirst({ where: eq(orders.id, input.id), with: { items: true } })
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
      const { holds } = await getPaymentSettings(context.db, context.config)
      return toAdminOrder(order, holds, context.now(), await loadExtras(context.db, [order]))
    }),

  /** Every paid or shipped order paid in the range, in one currency, oldest first. Not capped: it feeds the accountant's CSV. */
  export: adminProcedure
    .route({
      method: "GET",
      path: "/admin/orders/export",
      summary: "Paid orders of a period, for the CSV export",
      tags: TAG,
    })
    .input(orderExportInputSchema)
    .output(z.array(adminOrderSchema))
    .handler(async ({ context, input }) => {
      const { holds } = await getPaymentSettings(context.db, context.config)
      const rows = await context.db.query.orders.findMany({
        where: and(
          eq(orders.currency, input.currency),
          input.status ? eq(orders.status, input.status) : inArray(orders.status, ["paid", "fulfilled"]),
          gte(orders.paidAt, tunisDayStart(input.from)),
          lt(orders.paidAt, tunisDayStart(input.to, 1)),
        ),
        with: { items: true },
        orderBy: [asc(orders.paidAt)],
      })
      const extras = await loadExtras(context.db, rows)
      return rows.map((row) => toAdminOrder(row, holds, context.now(), extras))
    }),

  markPaidManually: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{id}/mark-paid",
      summary: "Confirm a payment received outside the site",
      tags: TAG,
    })
    .input(
      z.object({
        id: z.string(),
        method: manualPaymentMethodSchema,
        reference: z.string().trim().max(120).nullable(),
        note: z.string().trim().max(500).nullable(),
        totalMinor: z.number().int(),
        currency: currencySchema,
      }),
    )
    .output(z.object({ status: z.literal("paid"), alreadyPaid: z.boolean() }))
    .handler(({ context, input }) =>
      markPaidManually(context, {
        orderId: input.id,
        adminId: context.admin.id,
        method: input.method,
        reference: input.reference || null,
        note: input.note || null,
        expectedTotalMinor: input.totalMinor,
        expectedCurrency: input.currency,
      }),
    ),

  setPaymentLink: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{id}/payment-link",
      summary: "Set the Payoneer link of a pending order and email it to the customer",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), link: z.url().max(500) }))
    .output(z.object({ ok: z.literal(true), emailed: z.boolean() }))
    .handler(({ context, input }) =>
      setPaymentLink(context, { orderId: input.id, adminId: context.admin.id, link: input.link }),
    ),

  audit: adminProcedure
    .route({
      method: "GET",
      path: "/admin/orders/{id}/audit",
      summary: "Who changed this order, newest first",
      tags: TAG,
    })
    .input(z.object({ id: z.string() }))
    .output(z.array(orderAuditSchema))
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .select({ a: orderAudit, adminName: admins.name })
        .from(orderAudit)
        .leftJoin(admins, eq(admins.id, orderAudit.adminId))
        .where(eq(orderAudit.orderId, input.id))
        .orderBy(desc(orderAudit.createdAt))
      return rows.map(({ a, adminName }) => ({
        id: a.id,
        action: a.action,
        fromStatus: a.fromStatus,
        toStatus: a.toStatus,
        method: a.method,
        reference: a.reference,
        note: a.note,
        adminName,
        createdAt: a.createdAt.toISOString(),
      }))
    }),

  markShipped: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{id}/ship",
      summary: "Mark shipped with carrier and tracking",
      tags: TAG,
    })
    .input(z.object(shipFields).refine(needsCarrierName, carrierNameIssue))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const { id, ...ship } = input
      await markOrderShipped(context, id, ship, { adminId: context.admin.id })
      await tryIssueInvoice(context.db, id, context.now())
      return { ok: true as const }
    }),

  updateTracking: adminProcedure
    .route({
      method: "PATCH",
      path: "/admin/orders/{id}/tracking",
      summary: "Change the tracking of a shipped order",
      tags: TAG,
    })
    .input(z.object(shipFields).refine(needsCarrierName, carrierNameIssue))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const { id, ...ship } = input
      await updateOrderTracking(context, id, ship)
      return { ok: true as const }
    }),

  setStatus: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{id}/status",
      summary: "Mark paid (bank transfer), shipped, cancelled or refunded",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), status: orderStatusSchema.exclude(["pending_payment"]) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const order = await context.db.query.orders.findFirst({ where: eq(orders.id, input.id) })
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
      const adminId = context.admin.id
      if (input.status === "refunded" && order.status === "pending_payment")
        throw new ORPCError("BAD_REQUEST", { message: "An unpaid order cannot be refunded, cancel it instead." })
      const move = (patch: Partial<typeof orders.$inferInsert>, from: (typeof order)["status"]) =>
        context.db.transaction(async (tx) => {
          const [row] = await tx
            .update(orders)
            .set(patch)
            .where(and(eq(orders.id, order.id), eq(orders.status, from)))
            .returning({ id: orders.id })
          if (!row)
            throw new ORPCError("BAD_REQUEST", {
              message: `An order that is ${order.status} cannot become ${input.status}.`,
            })
          await recordAudit(tx, {
            orderId: order.id,
            adminId,
            action: "set_status",
            fromStatus: from,
            toStatus: input.status,
          })
        })
      if (input.status === "refunded" && order.status === "fulfilled") {
        await move({ status: "refunded" }, "fulfilled")
      } else if (input.status === "cancelled" || input.status === "refunded") {
        const changed = await cancelOrder(context.db, order.id, input.status, { adminId })
        if (!changed) {
          throw new ORPCError("BAD_REQUEST", {
            message: `An order that is ${order.status} cannot become ${input.status}.`,
          })
        }
      } else if (input.status === "paid" && order.status === "pending_payment") {
        await markPaidManually(context, {
          orderId: order.id,
          adminId,
          method:
            order.paymentMethod === "transfer" || order.paymentMethod === "payoneer" ? order.paymentMethod : "other",
          reference: null,
          note: null,
          expectedTotalMinor: order.totalMinor,
          expectedCurrency: order.currency,
        })
      } else if (input.status === "fulfilled") {
        await markOrderShipped(context, order.id, { carrier: "other" }, { adminId })
      } else {
        throw new ORPCError("BAD_REQUEST", {
          message: `An order that is ${order.status} cannot become ${input.status}.`,
        })
      }
      if (input.status === "fulfilled") await tryIssueInvoice(context.db, order.id, context.now())
      return { ok: true as const }
    }),
}

export const requestsRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/requests", summary: "Unique-piece requests", tags: TAG })
    .input(z.object({ status: requestStatusSchema.optional() }))
    .output(z.array(customRequestSchema))
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .select()
        .from(customRequests)
        .where(input.status ? eq(customRequests.status, input.status) : undefined)
        .orderBy(desc(customRequests.createdAt))
      return rows.map((r) => ({
        ...r,
        phone: r.phone ?? undefined,
        country: r.country ?? undefined,
        dimensions: r.dimensions ?? undefined,
        budget: r.budget ?? undefined,
        references: r.references ?? undefined,
        locale: r.locale as "fr" | "en" | "ar",
        createdAt: r.createdAt.toISOString(),
      }))
    }),

  update: adminProcedure
    .route({ method: "PUT", path: "/admin/requests/{id}", summary: "Set the status and a private note", tags: TAG })
    .input(z.object({ id: z.string(), status: requestStatusSchema, adminNote: z.string().max(2000).nullable() }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await context.db
        .update(customRequests)
        .set({ status: input.status, adminNote: input.adminNote })
        .where(eq(customRequests.id, input.id))
      return { ok: true as const }
    }),
}
