import { ORPCError } from "@orpc/server"
import { customRequests, orders } from "@workspace/db"
import {
  checkoutSchema,
  customRequestInputSchema,
  orderInputSchema,
  type PaymentMethod,
  PLACEHOLDER_BANK,
  publicInvoiceViewSchema,
  publicOrderSchema,
  requestUploadInputSchema,
} from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import type { Context } from "../../context"
import { publicError } from "../../errors"
import { invoiceView, issueInvoice } from "../../lib/invoices"
import { createOrder, settleOrder } from "../../lib/orders"
import { DemoProvider } from "../../lib/payments"
import { enforceLimit } from "../../lib/rate-limit"
import { getSettings } from "../../lib/settings"
import { getShopProfile, studioInbox } from "../../lib/shop-profile"
import { reserveUpload } from "../../lib/uploads"
import { publicProcedure } from "../../procedures"

const TAG = ["orders"]

export const ordersRouter = {
  create: publicProcedure
    .route({ method: "POST", path: "/orders", summary: "Place an order and get the payment link", tags: TAG })
    .input(orderInputSchema)
    .output(checkoutSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "orderCreate", "too_many_orders", "Too many orders, try again in a few minutes.")
      return createOrder(context, input)
    }),

  get: publicProcedure
    .route({ method: "GET", path: "/orders/{number}", summary: "An order, with the token from its link", tags: TAG })
    .input(z.object({ number: z.string(), token: z.string() }))
    .output(publicOrderSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "orderGet", "too_many_lookups", "Too many attempts, try again in a few minutes.")
      const order = await context.db.query.orders.findFirst({
        where: and(eq(orders.number, input.number), eq(orders.publicToken, input.token)),
        with: { items: true },
      })
      if (!order) throw publicError("NOT_FOUND", "order_not_found", "Order not found.")
      // The customer lands here right after paying, often before the webhook: ask the gateway now.
      const settled =
        order.status === "pending_payment" && order.paymentRef ? await settleOrder(context, order.paymentRef) : null
      const status = (settled?.status ?? order.status) as typeof order.status
      return {
        number: order.number,
        paymentMethod: order.paymentMethod as PaymentMethod,
        status,
        bank:
          order.paymentMethod === "transfer" && status === "pending_payment"
            ? ((await getSettings(context.db)).bank ?? PLACEHOLDER_BANK)
            : null,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        shippingMinor: order.shippingMinor,
        totalMinor: order.totalMinor,
        items: order.items.map(({ ref, title, unitMinor, quantity }) => ({ ref, title, unitMinor, quantity })),
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
      }
    }),

  invoice: publicProcedure
    .route({
      method: "GET",
      path: "/orders/{number}/invoice",
      summary: "The invoice of a paid order, with the token from its link",
      tags: TAG,
    })
    .input(z.object({ number: z.string(), token: z.string() }))
    .output(publicInvoiceViewSchema)
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "orderGet", "too_many_lookups", "Too many attempts, try again in a few minutes.")
      const order = await context.db.query.orders.findFirst({
        where: and(eq(orders.number, input.number), eq(orders.publicToken, input.token)),
        with: { items: true },
      })
      if (!order) throw publicError("NOT_FOUND", "order_not_found", "Order not found.")
      if (order.status !== "paid" && order.status !== "fulfilled") {
        throw publicError("NOT_FOUND", "order_not_found", "Invoice not available yet.")
      }
      const invoice = await issueInvoice(context.db, order.id, context.now())
      const {
        orderId: _orderId,
        canIssue: _canIssue,
        ...view
      } = invoiceView(order, invoice, await getShopProfile(context.db))
      return view
    }),

  /** Only exists with the demo provider (local and preview without gateway keys). */
  demoResolve: publicProcedure
    .route({ method: "POST", path: "/orders/demo-resolve", summary: "Demo checkout outcome", tags: TAG })
    .input(z.object({ ref: z.string(), outcome: z.enum(["paid", "failed", "mismatch"]) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      if (!(context.payments instanceof DemoProvider) || context.config.appEnv === "production") {
        throw publicError("NOT_FOUND", "payment_not_found", "Not found.")
      }
      const ref = await context.payments.resolve(context.db, input.ref, input.outcome)
      if (!ref) throw publicError("NOT_FOUND", "payment_not_found", "Unknown payment.")
      await settleOrder(context, ref)
      return { ok: true as const }
    }),
}

const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const

/** The studio answers requests by email, so it gets one the moment a request comes in. Never fails the request. */
async function notifyStudio(
  { db, mailer }: Pick<Context, "db" | "mailer">,
  request: z.infer<typeof customRequestInputSchema>,
) {
  try {
    const studio = studioInbox(await getShopProfile(db))
    if (!studio) return
    await mailer.send({
      to: studio,
      replyTo: request.email,
      subject: `Nouvelle demande de pièce unique : ${request.name}`,
      text: [
        `${request.name} <${request.email}>${request.phone ? ` ${request.phone}` : ""}${request.country ? ` (${request.country})` : ""}`,
        "",
        request.description,
        "",
        ...(request.dimensions ? [`Dimensions : ${request.dimensions}`] : []),
        ...(request.budget ? [`Budget : ${request.budget}`] : []),
        ...(request.references ? [`Références : ${request.references}`] : []),
        ...(request.images.length ? [`${request.images.length} photo(s) à voir dans le dashboard.`] : []),
        "",
        "Répondez directement à cet email pour écrire au client.",
      ].join("\n"),
    })
  } catch (error) {
    console.error("[request mail]", error)
  }
}

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
      if (!storage)
        throw publicError("SERVICE_UNAVAILABLE", "photos_unavailable", "Photos are not available right now.")
      await enforceLimit(context, "uploadUrl", "too_many_uploads", "Too many uploads, try again in a few minutes.")
      const key = `${storage.prefix}requests/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[input.contentType]}`
      await reserveUpload(context.db, {
        key,
        folder: "requests",
        contentType: input.contentType,
        bytes: input.size,
      }).catch((error) => {
        if (error instanceof ORPCError && error.code === "PAYLOAD_TOO_LARGE") {
          throw publicError("SERVICE_UNAVAILABLE", "photos_unavailable", "Photos are not available right now.")
        }
        throw error
      })
      return { uploadUrl: await storage.presignPut(key, input.contentType, input.size), image: `s3:${key}` }
    }),

  create: publicProcedure
    .route({ method: "POST", path: "/requests", summary: "Ask for a unique piece", tags: ["requests"] })
    .input(customRequestInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await enforceLimit(context, "requestCreate", "too_many_requests", "Too many requests, try again later.")
      const { storage } = context
      const required = `s3:${storage?.prefix ?? ""}requests/`
      for (const image of input.images) {
        const key = image.slice(3)
        const valid = storage && image.startsWith(required) && !key.includes("..") && (await storage.head(key))
        if (!valid) throw publicError("BAD_REQUEST", "photo_missing", "A photo was not uploaded, please add it again.")
      }
      await context.db.insert(customRequests).values({ ...input, email: input.email.toLowerCase() })
      await notifyStudio(context, input)
      return { ok: true as const }
    }),
}
