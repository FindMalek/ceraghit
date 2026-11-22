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

/** After a spec refreshed the city list from the simulated Aramex: serve it again in manual mode, like the demo list. */
export async function markCitiesAsDemo(): Promise<void> {
  await sql`update settings set value = jsonb_set(value, '{fixture}', 'true') where key = 'aramex:cities:TN'`
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

/** What the sales tiles and the CSV export of the last `days` studio days (Africa/Tunis) must add up to, straight from the db. */
export async function salesWindow(currency: "TND" | "EUR", days = 30): Promise<{ total: number; orders: number }> {
  const [row] = await sql<{ total: number; orders: number }[]>`
    select coalesce(sum(total_minor), 0)::int as total, count(*)::int as orders
    from orders
    where currency = ${currency} and status in ('paid', 'fulfilled')
      and paid_at >= (date_trunc('day', now() at time zone 'Africa/Tunis') - make_interval(days => ${days - 1})) at time zone 'Africa/Tunis'
      and paid_at < (date_trunc('day', now() at time zone 'Africa/Tunis') + interval '1 day') at time zone 'Africa/Tunis'`
  return row ?? { total: 0, orders: 0 }
}

export interface SaleSeed {
  number: string
  status: "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded"
  currency: "TND" | "EUR"
  totalMinor: number
  paidAt: Date | null
}

/** A bare order with fixed dates, for the statistics: createdAt follows paidAt so the orders list shows the same day. */
export async function insertSale(sale: SaleSeed): Promise<void> {
  const created = sale.paidAt ?? new Date()
  await sql`
    insert into orders (number, public_token, status, currency, subtotal_minor, total_minor, customer_name, email, phone,
      country, city, address, payment_method, paid_at, created_at)
    values (${sale.number}, ${`tok-${sale.number}`}, ${sale.status}, ${sale.currency}, ${sale.totalMinor}, ${sale.totalMinor},
      'Client Stats', 'stats@example.test', '+21620000000', ${sale.currency === "TND" ? "TN" : "FR"}, 'Tunis',
      '1 rue du Test', ${sale.currency === "TND" ? "cod" : "transfer"}, ${sale.paidAt}, ${created})`
}

export async function deleteOrdersLike(prefix: string): Promise<void> {
  await sql`delete from orders where number like ${`${prefix}%`}`
}

/** Forgets the Aramex keys of the vault, so a form test starts like a fresh install. */
export async function clearAramexCredentials(): Promise<void> {
  await sql`delete from integration_credentials where provider = 'aramex'`
}

export async function orderId(number: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`select id from orders where number = ${number}`
  if (!row) throw new Error(`no order ${number}`)
  return row.id
}

/** How many mails of each kind the api logged for an order, of any status or only those with `status` (e.g. "sent"). */
export async function mailKinds(number: string, status?: string): Promise<Record<string, number>> {
  const rows = await sql<{ kind: string; n: number }[]>`
    select m.kind, count(*)::int as n from mail_log m join orders o on o.id = m.order_id
    where o.number = ${number} and (${status ?? null}::text is null or m.status::text = ${status ?? null})
    group by m.kind`
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]))
}

/** Shipped orders own an invoice, so they cannot be deleted: swap awkward customer text for plain text instead. */
export async function neutraliseOrder(number: string): Promise<void> {
  await sql`update orders set customer_name = 'Client export', city = 'Tunis' where number = ${number}`
}

/** Gives an order's shipment a waybill the simulated Aramex answers with a given story (`DELIVERED`, `PROBLEM`). */
export async function setShipmentWaybill(number: string, waybill: string): Promise<void> {
  await sql`update shipments set waybill = ${waybill}, status = 'created' where order_id = (select id from orders where number = ${number})`
}
