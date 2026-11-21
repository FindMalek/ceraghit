import postgres from "postgres"
import { E2E } from "../env"

const sql = postgres(E2E.databaseUrl, { max: 2, idle_timeout: 5 })

export interface InvoiceRow {
  number: string
  year: number
  seq: number
}

export async function invoiceOf(orderNumber: string): Promise<InvoiceRow | null> {
  const [row] = await sql<InvoiceRow[]>`
    select i.number, i.year, i.seq from invoices i join orders o on o.id = i.order_id where o.number = ${orderNumber}`
  return row ?? null
}

export async function invoiceCountOf(orderNumber: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from invoices i join orders o on o.id = i.order_id where o.number = ${orderNumber}`
  return row?.n ?? 0
}

export async function lastSeq(year: number): Promise<number> {
  const [row] = await sql<{ last: number }[]>`select last from invoice_counters where year = ${year}`
  return row?.last ?? 0
}

export interface ItemRow {
  ref: string
  title: string
  quantity: number
  unitMinor: number
}

export async function itemsOf(orderNumber: string): Promise<ItemRow[]> {
  return sql<ItemRow[]>`
    select i.ref, i.title, i.quantity, i.unit_minor as "unitMinor"
    from order_items i join orders o on o.id = i.order_id where o.number = ${orderNumber} order by i.ref`
}

/** The VAT or tax mention printed under the invoice, one text per language. */
export async function setInvoiceNote(note: { fr: string; en: string; ar: string }): Promise<void> {
  await sql`update shop_profile set invoice_note = ${sql.json(note)}`
}

/** A paid order that has no invoice yet, as if the invoice step had not run: for the sequence under concurrency. */
export async function insertPaidOrder(number: string): Promise<void> {
  await sql`
    insert into orders (number, public_token, status, currency, subtotal_minor, total_minor, customer_name, email, phone,
      country, city, address, payment_method, paid_at)
    values (${number}, ${`tok-${number}`}, 'paid', 'TND', 10000, 10000, 'Client Facture', 'facture@example.test',
      '+21620000000', 'TN', 'Tunis', '1 rue du Test', 'cod', now())`
}

export async function deleteInvoicedOrdersLike(prefix: string): Promise<void> {
  await sql`delete from invoices where order_id in (select id from orders where number like ${`${prefix}%`})`
  await sql`delete from orders where number like ${`${prefix}%`}`
}
