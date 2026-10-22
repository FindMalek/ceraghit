import { ORPCError } from "@orpc/server"
import { customRequests, orders } from "@workspace/db"
import { checkoutSchema, customRequestInputSchema, orderInputSchema, orderSchema } from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { createOrder, settleOrder } from "../../lib/orders"
import { DemoProvider } from "../../lib/payments"
import { publicProcedure } from "../../procedures"

const TAG = ["orders"]

export const ordersRouter = {
  create: publicProcedure
    .route({ method: "POST", path: "/orders", summary: "Place an order and get the payment link", tags: TAG })
    .input(orderInputSchema)
    .output(checkoutSchema)
    .handler(({ context, input }) => createOrder(context, input)),

  get: publicProcedure
    .route({ method: "GET", path: "/orders/{number}", summary: "An order, with the token from its link", tags: TAG })
    .input(z.object({ number: z.string(), token: z.string() }))
    .output(orderSchema)
    .handler(async ({ context, input }) => {
      const order = await context.db.query.orders.findFirst({
        where: and(eq(orders.number, input.number), eq(orders.publicToken, input.token)),
        with: { items: true },
      })
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
      // The customer lands here right after paying, often before the webhook: ask the gateway now.
      const settled =
        order.status === "pending_payment" && order.paymentRef ? await settleOrder(context, order.paymentRef) : null
      return {
        number: order.number,
        status: (settled?.status ?? order.status) as typeof order.status,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        shippingMinor: order.shippingMinor,
        totalMinor: order.totalMinor,
        items: order.items.map(({ ref, title, unitMinor, quantity }) => ({ ref, title, unitMinor, quantity })),
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
      }
    }),

  /** Only exists with the demo provider (local and preview without gateway keys). */
  demoResolve: publicProcedure
    .route({ method: "POST", path: "/orders/demo-resolve", summary: "Demo checkout outcome", tags: TAG })
    .input(z.object({ ref: z.string(), outcome: z.enum(["paid", "failed"]) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      if (!(context.payments instanceof DemoProvider) || context.config.appEnv === "production") {
        throw new ORPCError("NOT_FOUND", { message: "Not found." })
      }
      if (!context.payments.resolve(input.ref, input.outcome))
        throw new ORPCError("NOT_FOUND", { message: "Unknown payment." })
      await settleOrder(context, input.ref)
      return { ok: true as const }
    }),
}

export const requestsRouter = {
  create: publicProcedure
    .route({ method: "POST", path: "/requests", summary: "Ask for a unique piece", tags: ["requests"] })
    .input(customRequestInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await context.db.insert(customRequests).values({ ...input, email: input.email.toLowerCase() })
      return { ok: true as const }
    }),
}
