import { readFile } from "node:fs/promises"
import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { auditRows, orderId, orderRow, salesWindow, shippingRow, stockOf } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

type Method = "transfer" | "cod"

async function placeOrder(page: Page, productId: string, paymentMethod: Method) {
  const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId, quantity: 1 }],
      currency: paymentMethod === "transfer" ? "EUR" : "TND",
      locale: "fr",
      paymentMethod,
      country: paymentMethod === "transfer" ? "FR" : "TN",
      ...BUYER,
    },
  })
  expect(made.ok()).toBe(true)
  return (await made.json()) as { number: string; token: string }
}

async function openOrder(page: Page, number: string): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/orders`)
  await page.getByPlaceholder("Numéro, nom ou email").fill(number)
  await page.getByText(number, { exact: true }).locator("visible=true").first().click()
  await expect(page.getByRole("heading", { name: number, exact: true })).toBeVisible()
}

test(
  "the owner moves orders through their states and the stock follows",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const place = async (method: Method) => (await placeOrder(page, piece.id, method)).number
    const open = (number: string) => openOrder(page, number)
    const status = async (number: string) => (await orderRow(number)).status
    const settled = (number: string, expected: string) => expect.poll(() => status(number)).toBe(expected)

    await loginAsOwnerAndWait(page)
    const stock = await stockOf(piece.id)
    const transfer = await place("transfer")
    const cod = await place("cod")
    expect(await stockOf(piece.id)).toBe(stock - 2)

    await step("a transfer order is marked paid by hand and the piece stays held", async () => {
      await open(transfer)
      await page.getByRole("button", { name: "Marquer payée" }).click()
      await expect(page.getByRole("heading", { name: "Confirmer le paiement reçu" })).toBeVisible()
      await page.getByRole("button", { name: "Confirmer le paiement" }).click()
      await settled(transfer, "paid")
      const order = await orderRow(transfer)
      expect(order.paidAt).not.toBeNull()
      expect(order.paymentProvider, "the order keeps its own provider").toBe("transfer")
      expect(await stockOf(piece.id)).toBe(stock - 2)
    })

    await step("a paid order is shipped", async () => {
      await open(transfer)
      await page.getByRole("button", { name: "Marquer expédiée" }).click()
      await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
      await settled(transfer, "fulfilled")
      expect(await stockOf(piece.id)).toBe(stock - 2)
    })

    await step("a cash on delivery order ships straight from pending and counts as paid", async () => {
      await open(cod)
      await page.getByRole("button", { name: "Marquer expédiée" }).click()
      await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
      await settled(cod, "fulfilled")
      expect((await orderRow(cod)).paidAt).not.toBeNull()
    })

    await step("refunding a shipped order keeps the stock, the piece left the studio", async () => {
      await open(transfer)
      await page.getByRole("button", { name: "Rembourser" }).click()
      await expect(page.getByRole("alertdialog")).toContainText("Les pièces ne retournent pas en stock")
      await page.getByRole("alertdialog").getByRole("button").last().click()
      await settled(transfer, "refunded")
      expect(await stockOf(piece.id)).toBe(stock - 2)
    })

    const pending = await place("transfer")
    await step("cancelling a pending order puts its piece back and removes every action", async () => {
      const before = await stockOf(piece.id)
      await open(pending)
      await page.getByRole("button", { name: "Annuler" }).click()
      await expect(page.getByRole("alertdialog")).toContainText("les pièces retournent en stock")
      await page.getByRole("alertdialog").getByRole("button").last().click()
      await settled(pending, "cancelled")
      expect(await stockOf(piece.id)).toBe(before + 1)
      await open(pending)
      for (const name of ["Marquer payée", "Marquer expédiée", "Annuler", "Rembourser"]) {
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
      }
    })
  },
)

test(
  "the owner records who paid, which carrier took the parcel and the customer sees it",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const order = await placeOrder(page, piece.id, "transfer")
    const poll = (expected: string) => expect.poll(async () => (await orderRow(order.number)).status).toBe(expected)
    await loginAsOwnerAndWait(page)

    await step("marking the order paid keeps an audit row: who, from which state, how and why", async () => {
      await openOrder(page, order.number)
      await page.getByRole("button", { name: "Marquer payée", exact: true }).click()
      await page.getByLabel("Référence du paiement (facultatif)").fill("PAYO-4471")
      await page.getByLabel("Note (facultatif)").fill("virement vérifié sur le relevé")
      await page.getByRole("button", { name: "Confirmer le paiement" }).click()
      await poll("paid")
      const [audit, ...more] = await auditRows(order.number)
      expect(more, "one audit row for one payment").toEqual([])
      expect(audit).toMatchObject({
        action: "mark_paid_manually",
        fromStatus: "pending_payment",
        toStatus: "paid",
        reference: "PAYO-4471",
        note: "virement vérifié sur le relevé",
      })
      expect(audit?.adminId, "the audit row names the admin").not.toBeNull()
      await openOrder(page, order.number)
      await expect(page.getByText("« virement vérifié sur le relevé »")).toBeVisible()
      await expect(page.getByText("réf. PAYO-4471")).toBeVisible()
      await expect(page.getByRole("button", { name: "Marquer payée", exact: true })).toHaveCount(0)
    })

    await step("a tracking link that is not https is refused and the order stays paid", async () => {
      await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
      await page.getByLabel("Lien de suivi").fill("javascript:alert(1)")
      await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
      await expect(page.getByText("Le lien de suivi doit commencer par https://.")).toBeVisible()
      expect((await orderRow(order.number)).status).toBe("paid")
      expect((await shippingRow(order.number)).trackingUrl).toBeNull()
    })

    await step("shipping with a carrier and a tracking number shows both to the owner", async () => {
      await openOrder(page, order.number)
      await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
      await page.getByLabel("Transporteur", { exact: true }).click()
      await page.getByRole("option", { name: "Rapid-Poste (La Poste Tunisienne)" }).click()
      await page.getByLabel("Numéro de suivi").fill("RR123456789TN")
      await page.getByLabel("Lien de suivi").fill("https://suivi.example.test/RR123456789TN")
      await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
      await poll("fulfilled")
      expect(await shippingRow(order.number)).toEqual({
        carrier: "rapid-poste",
        trackingNumber: "RR123456789TN",
        trackingUrl: "https://suivi.example.test/RR123456789TN",
      })
      await openOrder(page, order.number)
      await expect(page.getByText("RR123456789TN", { exact: true })).toBeVisible()
      await expect(page.getByText("Rapid-Poste (La Poste Tunisienne)", { exact: true })).toBeVisible()
    })

    await step("the customer's order page shows the carrier, the number and the tracking link", async () => {
      await page.goto(`${E2E.webUrl}/order/${order.number}?t=${order.token}`)
      await expect(page.getByText("Rapid-Poste (La Poste Tunisienne)")).toBeVisible()
      await expect(page.getByText("RR123456789TN", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: t("fr", "order.trackParcel") })).toHaveAttribute(
        "href",
        "https://suivi.example.test/RR123456789TN",
      )
    })

    await step("the status filter keeps the order under Expédiée and drops it under Annulée", async () => {
      const row = page.getByText(order.number, { exact: true }).locator("visible=true")
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByRole("combobox", { name: "Filtrer par statut" }).click()
      await page.getByRole("option", { name: "Expédiée", exact: true }).click()
      await expect(row).toHaveCount(1)
      await page.getByRole("combobox", { name: "Filtrer par statut" }).click()
      await page.getByRole("option", { name: "Annulée", exact: true }).click()
      await expect(row).toHaveCount(0)
    })
  },
)

const decimal = (minor: number, currency: "TND" | "EUR") =>
  currency === "TND" ? (minor / 1000).toFixed(3) : (minor / 100).toFixed(2)

test(
  "the csv export is one currency per file and adds up to the paid orders",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const tnd = await placeOrder(page, piece.id, "cod")
    const eur = await placeOrder(page, piece.id, "transfer")
    await loginAsOwnerAndWait(page)

    await step(
      "a cash on delivery order is shipped (paid, TND) and a transfer order is marked paid (EUR)",
      async () => {
        await openOrder(page, tnd.number)
        await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
        await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
        await expect.poll(async () => (await orderRow(tnd.number)).status).toBe("fulfilled")
        await openOrder(page, eur.number)
        await page.getByRole("button", { name: "Marquer payée", exact: true }).click()
        await page.getByRole("button", { name: "Confirmer le paiement" }).click()
        await expect.poll(async () => (await orderRow(eur.number)).status).toBe("paid")
      },
    )

    const download = async (currency: "TND" | "EUR"): Promise<string[][]> => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByRole("button", { name: "Exporter en CSV" }).click()
      await page.getByLabel("Devise").click()
      await page
        .getByRole("option", { name: new RegExp(currency === "TND" ? "dinar|TND|DT" : "euro|EUR|€", "i") })
        .click()
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Télécharger le CSV" }).click(),
      ])
      expect(file.suggestedFilename()).toContain(`commandes-${currency}-`)
      const text = await readFile((await file.path()) as string, "utf8")
      return text
        .replace(/^﻿/, "")
        .trim()
        .split("\r\n")
        .map((line) => line.split(";"))
    }

    for (const [currency, order] of [
      ["TND", tnd],
      ["EUR", eur],
    ] as const) {
      await step(`the ${currency} file holds ${currency} orders only and its total is the db sum`, async () => {
        const [header, ...lines] = await download(currency)
        const total = lines.at(-1)
        const rows = lines.slice(0, -1)
        const currencyColumn = header?.indexOf("devise") ?? -1
        const totalColumn = header?.indexOf("total") ?? -1
        expect(currencyColumn).toBeGreaterThan(-1)
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) expect(row[currencyColumn], `row ${row[0]}`).toBe(currency)
        const numbers = rows.map((row) => row[0])
        expect(numbers).toContain(order.number)
        const other = currency === "TND" ? eur : tnd
        expect(numbers, "the other currency never leaks in").not.toContain(other.number)

        const expected = await salesWindow(currency)
        expect(rows.length).toBe(expected.orders)
        expect(total?.[0]).toBe("TOTAL")
        expect(total?.[totalColumn]).toBe(decimal(expected.total, currency))
        expect(total?.[currencyColumn]).toBe(currency)
      })
    }
  },
)

test(
  "the api refuses illegal order moves and a payment is recorded once",
  { tag: ["@fr", "@desktop"] },
  async ({ page, playwright, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const pending = await placeOrder(page, piece.id, "transfer")
    const other = await placeOrder(page, piece.id, "transfer")
    await loginAsOwnerAndWait(page)
    const api = (id: string, path: string) => `${E2E.apiUrl}/v1/admin/orders/${id}/${path}`
    const post = async (id: string, path: string, data: object) =>
      page.request.post(api(id, path), { headers: { "x-csrf-token": "orpc" }, data })
    const pendingId = await orderId(pending.number)
    const otherId = await orderId(other.number)

    await step("moves the schema or the state machine do not allow are refused and change nothing", async () => {
      for (const status of ["pending_payment", "refunded", "fulfilled"]) {
        const res = await post(pendingId, "status", { status })
        // a transfer order that is still pending can be paid or cancelled, not refunded, and not shipped without a payment
        expect(res.status(), `pending -> ${status}`).toBeGreaterThanOrEqual(400)
        expect(res.status(), `pending -> ${status}`).toBeLessThan(500)
      }
      expect((await orderRow(pending.number)).status).toBe("pending_payment")
      const cancel = await post(pendingId, "status", { status: "cancelled" })
      expect(cancel.ok()).toBe(true)
      const revive = await post(pendingId, "status", { status: "paid" })
      expect(revive.status(), "cancelled -> paid").toBeGreaterThanOrEqual(400)
      expect((await orderRow(pending.number)).status).toBe("cancelled")
    })

    await step("a visitor can neither move an order nor record a payment", async () => {
      const visitor = await playwright.request.newContext()
      for (const [path, data] of [
        ["status", { status: "paid" }],
        ["mark-paid", { method: "transfer", reference: null, note: null, totalMinor: 1, currency: "EUR" }],
      ] as const) {
        const res = await visitor.post(api(otherId, path), { headers: { "x-csrf-token": "orpc" }, data })
        expect(res.status(), path).toBe(401)
      }
      await visitor.dispose()
      expect((await orderRow(other.number)).status).toBe("pending_payment")
    })

    await step("a payment for the wrong amount or currency is refused, the right one is recorded once", async () => {
      const order = await orderRow(other.number)
      const body = { method: "transfer", reference: "VIR-1", note: null, totalMinor: order.totalMinor, currency: "EUR" }
      const wrongAmount = await post(otherId, "mark-paid", { ...body, totalMinor: order.totalMinor - 1 })
      expect(wrongAmount.status()).toBeGreaterThanOrEqual(400)
      const wrongCurrency = await post(otherId, "mark-paid", { ...body, currency: "TND" })
      expect(wrongCurrency.status()).toBeGreaterThanOrEqual(400)
      expect((await orderRow(other.number)).status).toBe("pending_payment")

      const first = await post(otherId, "mark-paid", body)
      expect(await first.json()).toEqual({ status: "paid", alreadyPaid: false })
      const second = await post(otherId, "mark-paid", body)
      expect(await second.json()).toEqual({ status: "paid", alreadyPaid: true })
      expect(await auditRows(other.number), "one payment, one audit row").toHaveLength(1)
    })
  },
)
