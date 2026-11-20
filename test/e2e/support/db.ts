import postgres from "postgres"
import { E2E } from "../env"

const sql = postgres(E2E.databaseUrl, { max: 2, idle_timeout: 5 })

export interface OrderRow {
  number: string
  status: string
  currency: string
  subtotalMinor: number
  shippingMinor: number
  totalMinor: number
  paymentMethod: string
  paymentProvider: string | null
  paidAt: Date | null
  country: string
}

export async function orderRow(number: string): Promise<OrderRow> {
  const [row] = await sql<OrderRow[]>`
    select number, status, currency, subtotal_minor as "subtotalMinor", shipping_minor as "shippingMinor",
      total_minor as "totalMinor", payment_method as "paymentMethod", payment_provider as "paymentProvider",
      paid_at as "paidAt", country
    from orders where number = ${number}`
  if (!row) throw new Error(`no order ${number}`)
  return row
}

export async function orderCount(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from orders`
  return row?.n ?? 0
}

export async function stockOf(productId: string, variantId?: string | null): Promise<number> {
  const rows = variantId
    ? await sql<{ stock: number }[]>`select stock from product_variants where id = ${variantId}`
    : await sql<{ stock: number }[]>`select stock from products where id = ${productId}`
  return rows[0]?.stock ?? Number.NaN
}

export async function setStock(productId: string, stock: number): Promise<void> {
  await sql`update products set stock = ${stock} where id = ${productId}`
}

/** Moves an order back in time, the same as the server clock having moved forward. */
export async function ageOrder(number: string, minutes: number): Promise<void> {
  await sql`update orders set created_at = created_at - make_interval(mins => ${minutes}) where number = ${number}`
}

export interface AuditRow {
  action: string
  fromStatus: string
  toStatus: string
  method: string | null
  reference: string | null
  note: string | null
  adminId: string | null
}

/** The order's audit trail, oldest first. */
export async function auditRows(number: string): Promise<AuditRow[]> {
  return sql<AuditRow[]>`
    select a.action, a.from_status as "fromStatus", a.to_status as "toStatus", a.method, a.reference, a.note,
      a.admin_id as "adminId"
    from order_audit a join orders o on o.id = a.order_id
    where o.number = ${number} order by a.created_at`
}

export interface ShippingRow {
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
}

export async function shippingRow(number: string): Promise<ShippingRow> {
  const [row] = await sql<ShippingRow[]>`
    select carrier, tracking_number as "trackingNumber", tracking_url as "trackingUrl" from orders where number = ${number}`
  if (!row) throw new Error(`no order ${number}`)
  return row
}

/** What the CSV export of the last 30 studio days (Africa/Tunis) must add up to, straight from the db. */
export async function salesWindow(currency: "TND" | "EUR"): Promise<{ total: number; orders: number }> {
  const [row] = await sql<{ total: number; orders: number }[]>`
    select coalesce(sum(total_minor), 0)::int as total, count(*)::int as orders
    from orders
    where currency = ${currency} and status in ('paid', 'fulfilled')
      and paid_at >= (date_trunc('day', now() at time zone 'Africa/Tunis') - interval '29 days') at time zone 'Africa/Tunis'
      and paid_at < (date_trunc('day', now() at time zone 'Africa/Tunis') + interval '1 day') at time zone 'Africa/Tunis'`
  return row ?? { total: 0, orders: 0 }
}

export async function orderId(number: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`select id from orders where number = ${number}`
  if (!row) throw new Error(`no order ${number}`)
  return row.id
}
