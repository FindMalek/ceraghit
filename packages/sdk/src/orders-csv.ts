import { countryName, MINOR_UNITS } from "./format"
import type { Currency } from "./schemas"

export interface CsvOrder {
  number: string
  status: string
  currency: Currency
  paidAt: string | null
  createdAt: string
  customerName: string
  email: string
  country: string
  city: string
  items: { ref: string; quantity: number }[]
  subtotalMinor: number
  shippingMinor: number
  totalMinor: number
  paymentProvider: string | null
  paymentRef: string | null
}

export interface CsvSalesDay {
  day: string
  orders: number
  revenueMinor: number
}

const BOM = "﻿"

/** RFC 4180: quote a field that holds a separator, a quote or a line break, double the quotes inside. */
export function csvField(value: string | number): string {
  const text = String(value)
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** `;` separated (what French Excel opens by default), CRLF lines, optional UTF-8 byte order mark. */
export function toCsv(rows: (string | number)[][], opts: { bom?: boolean } = {}): string {
  return `${opts.bom ? BOM : ""}${rows.map((row) => row.map(csvField).join(";")).join("\r\n")}\r\n`
}

/** 60000 TND millimes → "60.000", 3450 EUR cents → "34.50". Integer maths, a dot, no thousands separator. */
export function decimalAmount(minor: number, currency: Currency): string {
  const unit = MINOR_UNITS[currency]
  const digits = String(unit).length - 1
  const sign = minor < 0 ? "-" : ""
  const abs = Math.abs(minor)
  return `${sign}${Math.floor(abs / unit)}.${String(abs % unit).padStart(digits, "0")}`
}

/** Tunisia has no daylight saving, so the studio day is always UTC+1. */
export function tunisIso(iso: string): string {
  return `${new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 19)}+01:00`
}

const ORDER_HEADER = [
  "numero",
  "date",
  "statut",
  "client",
  "email",
  "pays",
  "ville",
  "articles",
  "sous_total",
  "livraison",
  "total",
  "devise",
  "paiement",
  "reference_paiement",
]

/** One row per order, one file per currency, with a totals row at the bottom. */
export function buildOrdersCsv(orders: CsvOrder[], currency: Currency, opts: { bom?: boolean } = {}): string {
  const rows: (string | number)[][] = [ORDER_HEADER]
  let subtotal = 0
  let shipping = 0
  let total = 0
  for (const o of orders) {
    if (o.currency !== currency) throw new Error(`order ${o.number} is in ${o.currency}, not ${currency}`)
    subtotal += o.subtotalMinor
    shipping += o.shippingMinor
    total += o.totalMinor
    rows.push([
      o.number,
      tunisIso(o.paidAt ?? o.createdAt),
      o.status,
      o.customerName,
      o.email,
      countryName(o.country, "fr"),
      o.city,
      o.items.map((i) => `${i.ref} x${i.quantity}`).join(", "),
      decimalAmount(o.subtotalMinor, currency),
      decimalAmount(o.shippingMinor, currency),
      decimalAmount(o.totalMinor, currency),
      currency,
      o.paymentProvider ?? "",
      o.paymentRef ?? "",
    ])
  }
  rows.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    `${orders.length} commandes`,
    decimalAmount(subtotal, currency),
    decimalAmount(shipping, currency),
    decimalAmount(total, currency),
    currency,
    "",
    "",
  ])
  return toCsv(rows, opts)
}

/** Groups orders of one currency by the studio day they were paid, oldest first. */
export function salesByDay(orders: Pick<CsvOrder, "paidAt" | "createdAt" | "totalMinor">[]): CsvSalesDay[] {
  const days = new Map<string, CsvSalesDay>()
  for (const o of orders) {
    const day = tunisIso(o.paidAt ?? o.createdAt).slice(0, 10)
    const row = days.get(day) ?? { day, orders: 0, revenueMinor: 0 }
    row.orders += 1
    row.revenueMinor += o.totalMinor
    days.set(day, row)
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
}

/** Revenue per studio day for one currency, with a totals row. */
export function buildSalesCsv(days: CsvSalesDay[], currency: Currency, opts: { bom?: boolean } = {}): string {
  const rows: (string | number)[][] = [["jour", "commandes", "ventes", "devise"]]
  let orders = 0
  let revenue = 0
  for (const d of days) {
    orders += d.orders
    revenue += d.revenueMinor
    rows.push([d.day, d.orders, decimalAmount(d.revenueMinor, currency), currency])
  }
  rows.push(["TOTAL", orders, decimalAmount(revenue, currency), currency])
  return toCsv(rows, opts)
}
