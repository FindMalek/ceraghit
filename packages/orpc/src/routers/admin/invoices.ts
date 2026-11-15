import { ORPCError } from "@orpc/server"
import { type Db, invoices, orders } from "@workspace/db"
import { invoiceLocaleSchema, invoiceViewSchema } from "@workspace/sdk"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { invoiceView, issueInvoice } from "../../lib/invoices"
import { getShopProfile } from "../../lib/shop-profile"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]

async function readView(db: Db, id: string, lang?: z.infer<typeof invoiceLocaleSchema>) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id), with: { items: true } })
  if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
  const invoice = (await db.query.invoices.findFirst({ where: eq(invoices.orderId, id) })) ?? null
  return invoiceView(order, invoice, await getShopProfile(db), lang)
}

export const invoicesRouter = {
  get: adminProcedure
    .route({
      method: "GET",
      path: "/admin/orders/{id}/invoice",
      summary: "The invoice of an order, or a pro forma while it is unpaid",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), lang: invoiceLocaleSchema.optional() }))
    .output(invoiceViewSchema)
    .handler(({ context, input }) => readView(context.db, input.id, input.lang)),

  issue: adminProcedure
    .route({
      method: "POST",
      path: "/admin/orders/{id}/invoice",
      summary: "Give a paid order its invoice number",
      tags: TAG,
    })
    .input(z.object({ id: z.string(), lang: invoiceLocaleSchema.optional() }))
    .output(invoiceViewSchema)
    .handler(async ({ context, input }) => {
      await issueInvoice(context.db, input.id, context.now())
      return readView(context.db, input.id, input.lang)
    }),
}
