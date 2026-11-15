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

export async function orderItemQuantity(number: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select coalesce(sum(i.quantity), 0)::int as n from order_items i join orders o on o.id = i.order_id where o.number = ${number}`
  return row?.n ?? 0
}
