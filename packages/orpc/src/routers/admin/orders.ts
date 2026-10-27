import { ORPCError } from "@orpc/server"
import { customRequests, orders } from "@workspace/db"
import {
  adminOrderSchema,
  customRequestSchema,
  orderExportInputSchema,
  orderListQuerySchema,
  orderStatusSchema,
  requestStatusSchema,
} from "@workspace/sdk"
import { and, asc, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm"
import { z } from "zod"
import { cancelOrder, releaseExpiredHolds } from "../../lib/orders"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

type OrderRow = typeof orders.$inferSelect & {
  items: { ref: string; title: string; unitMinor: number; quantity: number }[]
}

function toAdminOrder(o: OrderRow) {
  return {
    id: o.id,
    number: o.number,
    paymentMethod: o.paymentMethod as "online" | "cod",
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
    paymentRef: o.paymentRef,
  }
}

/** A studio day in Africa/Tunis (UTC+1, no daylight saving) as a UTC instant. */
const tunisDayStart = (day: string, plus = 0) => new Date(new Date(`${day}T00:00:00+01:00`).getTime() + plus * 864e5)

export const ordersRouter = {
  list: adminProcedure
    .route({ method: "GET", path: "/admin/orders", summary: "Orders, newest first", tags: TAG })
    .input(orderListQuerySchema)
    .output(z.array(adminOrderSchema))
    .handler(async ({ context, input }) => {
      await releaseExpiredHolds(context.db, context.now())
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
      return rows.map(toAdminOrder)
    }),

  get: adminProcedure
    .route({ method: "GET", path: "/admin/orders/{id}", summary: "One order, for its invoice", tags: TAG })
    .input(z.object({ id: z.string() }))
    .output(adminOrderSchema)
    .handler(async ({ context, input }) => {
      const order = await context.db.query.orders.findFirst({ where: eq(orders.id, input.id), with: { items: true } })
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
      return toAdminOrder(order)
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
      return rows.map(toAdminOrder)
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
      if (input.status === "refunded" && order.status === "fulfilled") {
        await context.db.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id))
      } else if (input.status === "cancelled" || input.status === "refunded") {
        const changed = await cancelOrder(context.db, order.id, input.status)
        if (!changed) {
          throw new ORPCError("BAD_REQUEST", {
            message: `An order that is ${order.status} cannot become ${input.status}.`,
          })
        }
      } else if (input.status === "paid" && order.status === "pending_payment") {
        await context.db
          .update(orders)
          .set({ status: "paid", paidAt: context.now(), paymentProvider: order.paymentProvider ?? "manual" })
          .where(eq(orders.id, order.id))
      } else if (input.status === "fulfilled" && order.status === "paid") {
        await context.db.update(orders).set({ status: "fulfilled" }).where(eq(orders.id, order.id))
      } else {
        throw new ORPCError("BAD_REQUEST", {
          message: `An order that is ${order.status} cannot become ${input.status}.`,
        })
      }
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
