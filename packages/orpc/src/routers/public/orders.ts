import { ORPCError } from "@orpc/server"
import { customRequests, orders } from "@workspace/db"
import {
  checkoutSchema,
  customRequestInputSchema,
  orderInputSchema,
  orderSchema,
  requestUploadInputSchema,
} from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { createOrder, settleOrder } from "../../lib/orders"
import { DemoProvider } from "../../lib/payments"
import { clientAddress, RateLimit } from "../../lib/rate-limit"
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
        paymentMethod: order.paymentMethod as "online" | "cod",
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

const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
const uploadLimit = new RateLimit(12, 10 * 60_000)

export const requestsRouter = {
  /** A signed PUT for one photo of a request. Its size and type are part of the signature. */
  uploadUrl: publicProcedure
    .route({
      method: "POST",
      path: "/requests/upload-url",
      summary: "Signed url to upload a request photo",
      tags: ["requests"],
    })
    .input(requestUploadInputSchema)
    .output(z.object({ uploadUrl: z.string(), image: z.string() }))
    .handler(async ({ context, input }) => {
      const { storage } = context
      if (!storage) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Photos are not available right now." })
      if (!uploadLimit.take(clientAddress(context.headers))) {
        throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many uploads, try again in a few minutes." })
      }
      const key = `${storage.prefix}requests/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[input.contentType]}`
      return { uploadUrl: await storage.presignPut(key, input.contentType, input.size), image: `s3:${key}` }
    }),

  create: publicProcedure
    .route({ method: "POST", path: "/requests", summary: "Ask for a unique piece", tags: ["requests"] })
    .input(customRequestInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const { storage } = context
      const required = `s3:${storage?.prefix ?? ""}requests/`
      for (const image of input.images) {
        const key = image.slice(3)
        const valid = storage && image.startsWith(required) && !key.includes("..") && (await storage.head(key))
        if (!valid) throw new ORPCError("BAD_REQUEST", { message: "A photo was not uploaded, please add it again." })
      }
      await context.db.insert(customRequests).values({ ...input, email: input.email.toLowerCase() })
      return { ok: true as const }
    }),
}
