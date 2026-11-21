import { expect, test } from "bun:test"
import {
  buildOrdersCsv,
  buildSalesCsv,
  type CsvOrder,
  csvField,
  decimalAmount,
  salesByDay,
  toCsv,
} from "../src/orders-csv"

const order = (over: Partial<CsvOrder> = {}): CsvOrder => ({
  number: "CER-1",
  status: "paid",
  currency: "TND",
  paidAt: "2026-10-01T23:30:00Z",
  createdAt: "2026-10-01T23:00:00Z",
  customerName: 'Amel "Mimi" Trabelsi; Tunis',
  email: "amel@example.com",
  country: "TN",
  city: "Tunis",
  items: [{ ref: "0200", quantity: 2 }],
  subtotalMinor: 80_000,
  shippingMinor: 11_000,
  totalMinor: 91_000,
  paymentMethod: "online",
  paymentProvider: "konnect",
  paymentReference: null,
  paymentRef: "ref1",
  ...over,
})

test("fields with a separator, quote or line break are quoted and quotes doubled", () => {
  expect(csvField("plain")).toBe("plain")
  expect(csvField('a;b "c"')).toBe('"a;b ""c"""')
  expect(csvField("two\nlines")).toBe('"two\nlines"')
})

test("a text that Excel would run as a formula is neutralised, amounts are not", () => {
  expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)")
  expect(csvField("@sum")).toBe("'@sum")
  expect(csvField("+33 6 00")).toBe("'+33 6 00")
  expect(csvField("-5.00")).toBe("-5.00")
})

test("amounts are exact decimals with a dot, per currency", () => {
  expect(decimalAmount(91_000, "TND")).toBe("91.000")
  expect(decimalAmount(42_500, "TND")).toBe("42.500")
  expect(decimalAmount(3_405, "EUR")).toBe("34.05")
  expect(decimalAmount(0, "EUR")).toBe("0.00")
})

test("the orders file has a BOM on request, CRLF lines, studio-time dates and a totals row", () => {
  const csv = buildOrdersCsv(
    [order(), order({ number: "CER-2", subtotalMinor: 5_000, shippingMinor: 0, totalMinor: 5_000 })],
    "TND",
    { bom: true },
  )
  expect(csv.startsWith("﻿numero;date;")).toBe(true)
  const lines = csv.trimEnd().split("\r\n")
  expect(lines).toHaveLength(4)
  expect(lines[1]).toContain('"Amel ""Mimi"" Trabelsi; Tunis"')
  expect(lines[1]).toContain("2026-10-02T00:30:00+01:00")
  expect(lines[1]).toContain("0200 x2;80.000;11.000;91.000;TND")
  expect(lines[3]).toBe("TOTAL;;;;;;;2 commandes;85.000;11.000;96.000;TND;;;")
  expect(buildOrdersCsv([order()], "TND").startsWith("﻿")).toBe(false)
})

test("customer text that starts like a formula is written as text", () => {
  const csv = buildOrdersCsv([order({ customerName: "=HYPERLINK(1)", city: "+216", email: "@a.b" })], "TND")
  const row = csv.trimEnd().split("\r\n")[1] ?? ""
  expect(row).toContain("'=HYPERLINK(1)")
  expect(row).toContain("'+216")
  expect(row).toContain("'@a.b")
})

test("a Payoneer order shows its method and the reference the owner typed, in euros only", () => {
  const csv = buildOrdersCsv(
    [
      order({
        currency: "EUR",
        paymentMethod: "payoneer",
        paymentProvider: "payoneer",
        paymentReference: "PAYONEER-REQ-1",
        paymentRef: null,
        totalMinor: 3_450,
        subtotalMinor: 3_450,
        shippingMinor: 0,
      }),
    ],
    "EUR",
  )
  expect(csv.split("\r\n")[1]).toEndWith(";34.50;EUR;Payoneer;payoneer;PAYONEER-REQ-1")
})

test("an order in the other currency is refused instead of being summed", () => {
  expect(() => buildOrdersCsv([order({ currency: "EUR" })], "TND")).toThrow()
})

test("the sales file groups by studio day, keeps one currency and totals the same as the orders file", () => {
  const eur = [
    order({ currency: "EUR", paidAt: "2026-10-01T10:00:00Z", totalMinor: 1_000 }),
    order({ currency: "EUR", paidAt: "2026-10-01T23:30:00Z", totalMinor: 500 }),
    order({ currency: "EUR", paidAt: "2026-10-02T09:00:00Z", totalMinor: 2_500 }),
  ]
  const csv = buildSalesCsv(salesByDay(eur), "EUR")
  expect(csv.trimEnd().split("\r\n")).toEqual([
    "jour;commandes;ventes;devise",
    "2026-10-01;1;10.00;EUR",
    "2026-10-02;2;30.00;EUR",
    "TOTAL;3;40.00;EUR",
  ])
  expect(toCsv([["a", "b"]])).toBe("a;b\r\n")
})
