import { ORPCError } from "@orpc/server"
import { customRequests, orders, uploads } from "@workspace/db"
import {
  bankFromProfile,
  checkoutSchema,
  customRequestInputSchema,
  holdExpiresAt,
  orderInputSchema,
  type PaymentMethod,
  type PayoneerSettings,
  pick,
  publicInvoiceViewSchema,
  publicOrderSchema,
  REQUEST_IMAGE_MAX_BYTES,
  REQUEST_IMAGE_MAX_SIDE,
  readWebpSize,
  requestUploadInputSchema,
} from "@workspace/sdk"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import type { Context } from "../../context"
import { renderStudioRequest } from "../../emails/request"
import { publicError } from "../../errors"
import { invoiceView, issueInvoice } from "../../lib/invoices"
import { deliverMail } from "../../lib/mail-log"
import { createOrder, paymentReferences, settleOrder } from "../../lib/orders"
import { DemoProvider, resolvePayments } from "../../lib/payments"
import { enforceLimit } from "../../lib/rate-limit"
import { getPaymentSettings } from "../../lib/settings"
import { toShipping } from "../../lib/shipping-events"
import { getShopProfile, studioInbox } from "../../lib/shop-profile"
import { TOO_LARGE } from "../../lib/storage"
import { reserveUpload } from "../../lib/uploads"
import { publicProcedure } from "../../procedures"

const TAG = ["orders"]

function payoneerView(settings: PayoneerSettings, locale: string, orderLink: string | null) {
  const link = settings.mode === "static" ? settings.staticLink : orderLink
  return {
    link,
    receiverEmail: settings.receiverEmail,
    note: settings.note ? pick(settings.note, locale) || null : null,
    waitingForLink: link === null,
  }
}

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
        order.status === "pending_payment" && order.paymentMethod === "online" && order.paymentRef
          ? await settleOrder(context, order.paymentRef)
          : null
      const status = (settled?.status ?? order.status) as typeof order.status
      const payBefore =
        status === "pending_payment" && order.paymentMethod === "transfer"
          ? holdExpiresAt(order, (await getPaymentSettings(context.db, context.config)).holds)
          : null
      const payoneer =
        order.paymentMethod === "payoneer" && status === "pending_payment"
          ? payoneerView(
              (await getPaymentSettings(context.db, context.config)).payoneer,
              order.locale,
              order.paymentRef,
            )
          : null
      return {
        payBefore: payBefore?.toISOString() ?? null,
        payoneer,
        number: order.number,
        paymentMethod: order.paymentMethod as PaymentMethod,
        status,
        bank:
          order.paymentMethod === "transfer" && status === "pending_payment"
            ? bankFromProfile(await getShopProfile(context.db))
            : null,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        shippingMinor: order.shippingMinor,
        totalMinor: order.totalMinor,
        items: order.items.map(({ ref, title, unitMinor, quantity }) => ({ ref, title, unitMinor, quantity })),
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        shipping: status === "fulfilled" ? toShipping(order) : null,
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
      } = invoiceView(
        order,
        invoice,
        await getShopProfile(context.db),
        undefined,
        (await paymentReferences(context.db, [order.id])).get(order.id) ?? null,
      )
      return view
    }),

  /** Only exists with the demo provider (local and preview without gateway keys). */
  demoResolve: publicProcedure
    .route({ method: "POST", path: "/orders/demo-resolve", summary: "Demo checkout outcome", tags: TAG })
    .input(z.object({ ref: z.string(), outcome: z.enum(["paid", "failed", "mismatch"]) }))
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const payments = await resolvePayments(context)
      if (!(payments instanceof DemoProvider) || context.config.appEnv === "production") {
        throw publicError("NOT_FOUND", "payment_not_found", "Not found.")
      }
      const ref = await payments.resolve(context.db, input.ref, input.outcome)
      if (!ref) throw publicError("NOT_FOUND", "payment_not_found", "Unknown payment.")
      await settleOrder(context, ref)
      return { ok: true as const }
    }),
}

const IMAGE_EXTENSIONS = { "image/webp": "webp" } as const

/** The studio answers requests by email, so it gets one the moment a request comes in. Never fails the request. */
async function notifyStudio(services: Context, request: z.infer<typeof customRequestInputSchema>) {
  try {
    const studio = studioInbox(await getShopProfile(services.db))
    if (!studio) return
    await deliverMail(services, "request_studio", await renderStudioRequest(request, studio, services.config.webUrl), {
      inline: true,
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
        if (!storage || !image.startsWith(required) || key.includes("..")) {
          throw publicError("BAD_REQUEST", "photo_missing", "A photo was not uploaded, please add it again.")
        }
        const bytes = await storage.read(key, REQUEST_IMAGE_MAX_BYTES).catch((error) => {
          if (error instanceof Error && error.message === TOO_LARGE) return "too big" as const
          throw error
        })
        if (bytes === null) {
          throw publicError("BAD_REQUEST", "photo_missing", "A photo was not uploaded, please add it again.")
        }
        const size = bytes === "too big" ? null : readWebpSize(bytes)
        if (!size || Math.max(size.width, size.height) > REQUEST_IMAGE_MAX_SIDE) {
          await storage.remove(key).catch(() => {})
          await context.db.delete(uploads).where(eq(uploads.key, key))
          throw publicError("BAD_REQUEST", "photo_unreadable", "A photo could not be read, please send it again.")
        }
      }
      await context.db.insert(customRequests).values({ ...input, email: input.email.toLowerCase() })
      await notifyStudio(context, input)
      return { ok: true as const }
    }),
}
