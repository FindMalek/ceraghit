import { ORPCError } from "@orpc/server"
import { type Db, type InvoiceSeller, invoiceCounters, invoices, orders } from "@workspace/db"
import { bankFromProfile, type InvoiceLocale, type InvoiceView, type PaymentMethod } from "@workspace/sdk"
import { eq, sql } from "drizzle-orm"
import { getShopProfile, type ShopProfileRow } from "./shop-profile"

export type InvoiceRow = typeof invoices.$inferSelect
type OrderWithItems = typeof orders.$inferSelect & {
  items: { ref: string; title: string; unitMinor: number; quantity: number }[]
}

const LOCALES: InvoiceLocale[] = ["fr", "en", "ar"]
const toLocale = (value: string): InvoiceLocale =>
  LOCALES.includes(value as InvoiceLocale) ? (value as InvoiceLocale) : "fr"

/** The invoice year follows the studio calendar (Africa/Tunis), not UTC. */
const tunisYear = (date: Date): number =>
  Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric" }).format(date))

export const formatInvoiceNumber = (year: number, seq: number): string => `${year}-${String(seq).padStart(4, "0")}`

export function sellerFromProfile(profile: ShopProfileRow): InvoiceSeller {
  return {
    displayName: profile.displayName,
    legalName: profile.legalName,
    legalForm: profile.legalForm,
    taxId: profile.taxId,
    registryNumber: profile.registryNumber,
    address: profile.address,
    postalCode: profile.postalCode,
    city: profile.city,
    country: profile.country,
    phone: profile.phones[0] ?? null,
    email: profile.email,
    invoiceNote: profile.invoiceNote,
    bank: bankFromProfile(profile),
  }
}

const sellerView = (seller: InvoiceSeller): InvoiceView["seller"] => ({
  ...seller,
  bank: seller.bank && { ...seller.bank, rib: seller.bank.rib ?? "" },
})

const isIssuable = (status: string) => status === "paid" || status === "fulfilled"

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false
  const { code, cause } = error as { code?: unknown; cause?: unknown }
  return code === "23505" || isUniqueViolation(cause)
}

/**
 * Gives a paid order its invoice number, once. The counter row is locked by the upsert until the transaction ends,
 * so concurrent issues queue up and the sequence has no gaps (a failed insert rolls the counter back too).
 */
export async function issueInvoice(db: Db, orderId: string, now: Date): Promise<InvoiceRow> {
  const existing = () => db.query.invoices.findFirst({ where: eq(invoices.orderId, orderId) })
  const found = await existing()
  if (found) return found

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) throw new ORPCError("NOT_FOUND", { message: "Order not found." })
  if (!isIssuable(order.status)) {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Only paid orders get an invoice." })
  }
  const seller = sellerFromProfile(await getShopProfile(db))
  const year = tunisYear(now)

  try {
    return await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update")
      if (!locked || !isIssuable(locked.status)) {
        throw new ORPCError("PRECONDITION_FAILED", { message: "Only paid orders get an invoice." })
      }
      const [counter] = await tx
        .insert(invoiceCounters)
        .values({ year, last: 1 })
        .onConflictDoUpdate({ target: invoiceCounters.year, set: { last: sql`${invoiceCounters.last} + 1` } })
        .returning({ last: invoiceCounters.last })
      const seq = counter!.last
      const [row] = await tx
        .insert(invoices)
        .values({ orderId, number: formatInvoiceNumber(year, seq), year, seq, issuedAt: now, seller })
        .returning()
      return row!
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await existing()
      if (raced) return raced
    }
    throw error
  }
}

/** Issues the invoice after a status change without ever failing it. */
export async function tryIssueInvoice(db: Db, orderId: string, now: Date): Promise<void> {
  try {
    await issueInvoice(db, orderId, now)
  } catch (error) {
    console.error(`[invoice ${orderId}] not issued`, error)
  }
}

export function invoiceView(
  order: OrderWithItems,
  invoice: InvoiceRow | null,
  profile: ShopProfileRow,
  lang?: InvoiceLocale,
  paymentReference: string | null = null,
): InvoiceView {
  const orderLocale = toLocale(order.locale)
  return {
    orderId: order.id,
    locale: lang ?? orderLocale,
    orderLocale,
    number: invoice?.number ?? null,
    issuedAt: invoice?.issuedAt.toISOString() ?? null,
    canIssue: !invoice && isIssuable(order.status),
    orderNumber: order.number,
    orderStatus: order.status,
    orderDate: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    currency: order.currency,
    paymentMethod: order.paymentMethod as PaymentMethod,
    paymentReference,
    items: order.items.map(({ ref, title, unitMinor, quantity }) => ({ ref, title, unitMinor, quantity })),
    subtotalMinor: order.subtotalMinor,
    shippingMinor: order.shippingMinor,
    totalMinor: order.totalMinor,
    customer: {
      name: order.customerName,
      email: order.email,
      phone: order.phone,
      address: order.address,
      postalCode: order.postalCode,
      city: order.city,
      country: order.country,
    },
    seller: sellerView(invoice?.seller ?? sellerFromProfile(profile)),
  }
}

export const invoiceUrl = (webUrl: string, order: { locale: string; number: string; publicToken: string }): string =>
  `${webUrl}/${order.locale}/order/${order.number}/invoice?t=${order.publicToken}`
