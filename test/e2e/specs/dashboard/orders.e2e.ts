import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow, stockOf } from "../../support/db"

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
    await loginAsOwnerAndWait(page)

    await step("marking the order paid keeps a trace of who, how and why", async () => {
      await openOrder(page, order.number)
      await page.getByRole("button", { name: "Marquer payée", exact: true }).click()
      await page.getByLabel("Référence du paiement (facultatif)").fill("PAYO-4471")
      await page.getByLabel("Note (facultatif)").fill("virement vérifié sur le relevé")
      await page.getByRole("button", { name: "Confirmer le paiement" }).click()
      await expect.poll(async () => (await orderRow(order.number)).status).toBe("paid")
      await openOrder(page, order.number)
      await expect(page.getByText("« virement vérifié sur le relevé »")).toBeVisible()
      await expect(page.getByText("réf. PAYO-4471")).toBeVisible()
      await expect(page.getByRole("button", { name: "Marquer payée", exact: true })).toHaveCount(0)
    })

    await step("shipping with a carrier and a tracking number shows both to the owner", async () => {
      await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
      await page.getByLabel("Transporteur", { exact: true }).click()
      await page.getByRole("option", { name: "Rapid-Poste (La Poste Tunisienne)" }).click()
      await page.getByLabel("Numéro de suivi").fill("RR123456789TN")
      await page.getByLabel("Lien de suivi").fill("https://suivi.example.test/RR123456789TN")
      await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
      await expect.poll(async () => (await orderRow(order.number)).status).toBe("fulfilled")
      await openOrder(page, order.number)
      await expect(page.getByText("RR123456789TN")).toBeVisible()
      await expect(page.getByText("Rapid-Poste (La Poste Tunisienne)")).toBeVisible()
    })

    await step("the customer's order page shows the carrier, the number and the tracking link", async () => {
      await page.goto(`${E2E.webUrl}/order/${order.number}?t=${order.token}`)
      await expect(page.getByText("Rapid-Poste (La Poste Tunisienne)")).toBeVisible()
      await expect(page.getByText("RR123456789TN")).toBeVisible()
      await expect(page.getByRole("link", { name: t("fr", "order.trackParcel") })).toHaveAttribute(
        "href",
        "https://suivi.example.test/RR123456789TN",
      )
    })

    await step("the status filter lists only the orders in that state", async () => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByRole("combobox", { name: "Filtrer par statut" }).click()
      await page.getByRole("option", { name: "Expédiée", exact: true }).click()
      await page.getByPlaceholder("Numéro, nom ou email").fill(order.number)
      await expect(page.getByText(order.number, { exact: true }).locator("visible=true")).toHaveCount(1)
      await page.getByRole("combobox", { name: "Filtrer par statut" }).click()
      await page.getByRole("option", { name: "Annulée", exact: true }).click()
      await expect(page.getByText(order.number, { exact: true }).locator("visible=true")).toHaveCount(0)
    })
  },
)
