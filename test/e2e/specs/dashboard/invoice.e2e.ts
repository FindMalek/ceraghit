import { readFile } from "node:fs/promises"
import type { Page } from "@playwright/test"
import { formatMoney, INVOICE_COPY, type InvoiceLocale } from "@workspace/sdk"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderId, orderRow } from "../../support/db"
import {
  deleteInvoicedOrdersLike,
  insertPaidOrder,
  invoiceCountOf,
  invoiceOf,
  itemsOf,
  lastSeq,
  setInvoiceNote,
} from "../../support/invoices"

const PREFIX = "E2E-INV-"
const NOTE = {
  fr: "TVA non applicable, article 293 B du CGI.",
  en: "VAT not applicable, article 293 B of the French tax code.",
  ar: "الأداء على القيمة المضافة غير مطبق.",
}

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await setInvoiceNote(NOTE)
})

test.afterAll(async () => {
  await deleteInvoicedOrdersLike(PREFIX)
})

type Method = "transfer" | "cod"

async function placeOrder(page: Page, productId: string, method: Method, locale: InvoiceLocale = "fr") {
  const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId, quantity: 1 }],
      currency: method === "transfer" ? "EUR" : "TND",
      locale,
      paymentMethod: method,
      country: method === "transfer" ? "FR" : "TN",
      ...BUYER,
    },
  })
  expect(made.ok()).toBe(true)
  return (await made.json()) as { number: string; token: string }
}

const adminApi = (id: string, path: string) => `${E2E.apiUrl}/v1/admin/orders/${id}/${path}`
const csrf = { "x-csrf-token": "orpc" }

async function markPaid(page: Page, number: string): Promise<void> {
  const order = await orderRow(number)
  const res = await page.request.post(adminApi(await orderId(number), "mark-paid"), {
    headers: csrf,
    data: { method: "transfer", reference: null, note: null, totalMinor: order.totalMinor, currency: order.currency },
  })
  expect(res.ok()).toBe(true)
}

async function openInvoice(page: Page, number: string, lang?: InvoiceLocale) {
  await page.goto(`${E2E.dashboardUrl}/invoice/${await orderId(number)}${lang ? `?lang=${lang}` : ""}`)
  const sheet = page.locator("article.invoice")
  await expect(sheet).toBeVisible()
  return sheet
}

test("a shipped cash on delivery order gets a French invoice in dinars with the studio's legal details", async ({
  page,
  step,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const order = await placeOrder(page, piece.id, "cod")
  await loginAsOwnerAndWait(page)

  await step("the owner ships the order and it gets an invoice number", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(order.number)
    await page.getByText(order.number, { exact: true }).locator("visible=true").first().click()
    await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
    await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
    await expect.poll(async () => (await orderRow(order.number)).status).toBe("fulfilled")
    await expect.poll(() => invoiceOf(order.number)).not.toBeNull()
  })

  const copy = INVOICE_COPY.fr
  const db = await orderRow(order.number)
  const invoice = await invoiceOf(order.number)
  const items = await itemsOf(order.number)

  await step("the invoice shows the seller, the customer, the lines and the totals in dinars only", async () => {
    const sheet = await openInvoice(page, order.number)
    await expect(sheet).toHaveAttribute("lang", "fr")
    await expect(sheet).toHaveAttribute("dir", "ltr")
    await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(copy.invoice)
    await expect(sheet).toContainText(`${copy.invoiceNo} ${invoice?.number}`)
    expect(invoice?.number).toMatch(/^\d{4}-\d{4}$/)

    for (const text of [
      "Ceraghit Creation",
      "1 rue de l'Atelier",
      "+21620000000",
      "shop@e2e.local",
      `${copy.taxId} : 1234567/A/M/000`,
      BUYER.customerName,
      BUYER.address,
      BUYER.email,
      NOTE.fr,
    ]) {
      await expect(sheet, text).toContainText(text)
    }

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const row = sheet.locator("tbody tr").filter({ hasText: item.ref })
      await expect(row).toContainText(item.title)
      const cells = await row.locator("td").allInnerTexts()
      expect(cells[1]).toBe(String(item.quantity))
      expect(cells[2]).toBe(formatMoney(item.unitMinor, "TND", "fr"))
      expect(cells[3]).toBe(formatMoney(item.unitMinor * item.quantity, "TND", "fr"))
    }
    expect(await sheet.locator(".invoice-totals dd").allInnerTexts()).toEqual([
      formatMoney(db.subtotalMinor, "TND", "fr"),
      formatMoney(db.shippingMinor, "TND", "fr"),
      formatMoney(db.totalMinor, "TND", "fr"),
    ])
    await expect(sheet.locator(".invoice-totals")).not.toContainText("€")
    await expect(sheet).not.toContainText("À compléter")
    await expect(sheet).not.toContainText(copy.proforma)
    await expect(sheet).toContainText(`${copy.paymentMethod} : ${copy.cod}`)
  })

  await step("the order sheet downloads the same invoice as a PDF named after its number", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(order.number)
    await page.getByText(order.number, { exact: true }).locator("visible=true").first().click()
    const [file] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      page.getByRole("button", { name: "Facture PDF" }).click(),
    ])
    expect(file.suggestedFilename()).toBe(`facture-${invoice?.number}.pdf`)
    const bytes = await readFile((await file.path()) as string)
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
  })
})

test("a transfer order in euros shows the bank details, and the invoice follows the order language", async ({
  page,
  step,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const english = await placeOrder(page, piece.id, "transfer", "en")
  const arabic = await placeOrder(page, piece.id, "transfer", "ar")
  await loginAsOwnerAndWait(page)
  await markPaid(page, english.number)
  await markPaid(page, arabic.number)

  await step("an English order gets an English invoice in euros with holder, bank and RIB", async () => {
    const sheet = await openInvoice(page, english.number)
    const copy = INVOICE_COPY.en
    await expect(sheet).toHaveAttribute("lang", "en")
    await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(copy.invoice)
    await expect(sheet).toContainText(`${copy.paymentMethod} : ${copy.transfer}`)
    await expect(sheet).toContainText(`${copy.bankHolder} : Ceraghit Creation`)
    await expect(sheet).toContainText(`${copy.bankName} : Banque e2e`)
    await expect(sheet).toContainText("RIB : 10006035183598478831")
    await expect(sheet).toContainText(NOTE.en)
    const order = await orderRow(english.number)
    expect(await sheet.locator(".invoice-totals dd").last().innerText()).toBe(
      formatMoney(order.totalMinor, "EUR", "en"),
    )
    await expect(sheet.locator(".invoice-totals")).not.toContainText("DT")
    await expect(sheet).not.toContainText("À compléter")
  })

  await step("an Arabic order gets a right to left invoice with its figures kept left to right", async () => {
    const sheet = await openInvoice(page, arabic.number)
    const copy = INVOICE_COPY.ar
    await expect(sheet).toHaveAttribute("lang", "ar")
    await expect(sheet).toHaveAttribute("dir", "rtl")
    await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(copy.invoice)
    await expect(sheet).toContainText(NOTE.ar)
    const total = await sheet.locator(".invoice-totals dd").last().innerText()
    expect(total).toBe(formatMoney((await orderRow(arabic.number)).totalMinor, "EUR", "ar"))
    expect(total, "the amount is one isolated left to right unit").toMatch(/^⁦.*€⁩$/)
    const number = (await invoiceOf(arabic.number))?.number ?? ""
    await expect(sheet.locator("bdi[dir=ltr]").filter({ hasText: number })).toBeVisible()
  })

  await step("the owner can switch the language of an issued invoice without changing its number", async () => {
    const before = (await invoiceOf(arabic.number))?.number
    await page.getByRole("button", { name: "Français" }).click()
    const sheet = page.locator("article.invoice")
    await expect(sheet).toHaveAttribute("lang", "fr")
    await expect(sheet).toHaveAttribute("dir", "ltr")
    await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(INVOICE_COPY.fr.invoice)
    await expect(sheet).toContainText(`${INVOICE_COPY.fr.invoiceNo} ${before}`)
  })
})

test("invoice numbers follow each other without gaps, stay the same when reopened, and never repeat under load", async ({
  page,
  step,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const orders = [
    await placeOrder(page, piece.id, "transfer"),
    await placeOrder(page, piece.id, "transfer"),
    await placeOrder(page, piece.id, "transfer"),
  ]
  await loginAsOwnerAndWait(page)
  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric" }).format(new Date()),
  )

  await step("three orders paid in turn get three consecutive numbers of the current year", async () => {
    const first = (await lastSeq(year)) + 1
    for (const order of orders) await markPaid(page, order.number)
    const numbers = await Promise.all(orders.map((o) => invoiceOf(o.number)))
    expect(numbers.map((n) => n?.seq)).toEqual([first, first + 1, first + 2])
    expect(numbers.map((n) => n?.number)).toEqual(
      [first, first + 1, first + 2].map((seq) => `${year}-${String(seq).padStart(4, "0")}`),
    )
  })

  await step("reopening an invoice shows the number it already had", async () => {
    const issued = await invoiceOf(orders[1]?.number ?? "")
    const sheet = await openInvoice(page, orders[1]?.number ?? "")
    await expect(sheet).toContainText(`${INVOICE_COPY.fr.invoiceNo} ${issued?.number}`)
    await page.reload()
    await expect(page.locator("article.invoice")).toContainText(`${INVOICE_COPY.fr.invoiceNo} ${issued?.number}`)
    expect(await invoiceOf(orders[1]?.number ?? "")).toEqual(issued)
  })

  await step("two invoices issued at the same moment get two consecutive numbers, and one order gets one", async () => {
    const [a, b] = [`${PREFIX}A`, `${PREFIX}B`]
    await insertPaidOrder(a)
    await insertPaidOrder(b)
    const first = (await lastSeq(year)) + 1
    const issue = async (number: string) =>
      page.request.post(adminApi(await orderId(number), "invoice"), { headers: csrf, data: {} })
    const results = await Promise.all([issue(a), issue(a), issue(b), issue(b)])
    for (const res of results) expect(res.ok()).toBe(true)
    const [ia, ib] = [await invoiceOf(a), await invoiceOf(b)]
    expect([ia?.seq, ib?.seq].sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([first, first + 1])
    expect(await invoiceCountOf(a)).toBe(1)
    expect(await invoiceCountOf(b)).toBe(1)
    expect(await lastSeq(year), "no number was burned").toBe(first + 1)
    const bodies = await Promise.all(results.map((r) => r.json() as Promise<{ number: string }>))
    expect(new Set(bodies.map((x) => x.number))).toEqual(new Set([ia?.number, ib?.number]))
  })
})

test("the invoice prints on one clean A4 page without the page controls", async ({ page, step }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const order = await placeOrder(page, piece.id, "transfer")
  await loginAsOwnerAndWait(page)
  await markPaid(page, order.number)

  await step("on screen the language and print controls are shown", async () => {
    await openInvoice(page, order.number)
    await expect(page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Français" })).toBeVisible()
  })

  await step("in print the controls are gone, the logo is drawn and nothing is clipped", async () => {
    await page.emulateMedia({ media: "print" })
    const sheet = page.locator("article.invoice")
    await expect(page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Français" })).toBeHidden()
    const logo = sheet.locator("img").first()
    await expect(logo).toBeVisible()
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    const clipped = await page.evaluate(() => {
      const root = document.querySelector("article.invoice") as HTMLElement
      return [root, ...root.querySelectorAll<HTMLElement>("*")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
        .map((el) => el.tagName)
    })
    expect(clipped).toEqual([])
    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true })
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []
    expect(pages, "one invoice, one page").toHaveLength(1)
  })
})

test("a customer opens their invoice from the order page with their own link only", async ({
  page,
  step,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const paid = await placeOrder(page, piece.id, "transfer")
  const other = await placeOrder(page, piece.id, "transfer")
  const pending = await placeOrder(page, piece.id, "transfer")
  await loginAsOwnerAndWait(page)
  await markPaid(page, paid.number)
  await markPaid(page, other.number)
  const invoice = await invoiceOf(paid.number)
  const invoicePath = (number: string, token?: string) =>
    `${E2E.webUrl}/order/${number}/invoice${token === undefined ? "" : `?t=${token}`}`

  await step("the order page of a paid order links to the invoice and the link opens it", async () => {
    await page.goto(`${E2E.webUrl}/order/${paid.number}?t=${paid.token}`)
    await page.getByRole("link", { name: t("fr", "order.invoiceLink") }).click()
    await expect(page.locator("article.invoice")).toContainText(`${INVOICE_COPY.fr.invoiceNo} ${invoice?.number}`)
    await expect(page.locator("article.invoice")).toContainText(paid.number)
  })

  await step("the page of an order that is not paid has no invoice link", async () => {
    await page.goto(`${E2E.webUrl}/order/${pending.number}?t=${pending.token}`)
    await expect(page.getByRole("link", { name: t("fr", "order.invoiceLink") })).toHaveCount(0)
  })

  await step("no token, another order's token, a wrong token or an unpaid order all give 404", async () => {
    for (const [label, url] of [
      ["no token", invoicePath(paid.number)],
      ["another order's token", invoicePath(paid.number, other.token)],
      ["a wrong token", invoicePath(paid.number, "nope")],
      ["an unpaid order", invoicePath(pending.number, pending.token)],
    ] as const) {
      const res = await page.goto(url)
      expect(res?.status(), label).toBe(404)
    }
    expect(await invoiceOf(pending.number), "an unpaid order never gets a number").toBeNull()
  })
})
