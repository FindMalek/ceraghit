import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { pieceFor } from "../../support/catalogue"
import { orderRow, stockOf } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

type Method = "transfer" | "cod"

test(
  "the owner moves orders through their states and the stock follows",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const place = async (paymentMethod: Method): Promise<string> => {
      const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
        data: {
          items: [{ productId: piece.id, quantity: 1 }],
          currency: paymentMethod === "transfer" ? "EUR" : "TND",
          locale: "fr",
          paymentMethod,
          country: paymentMethod === "transfer" ? "FR" : "TN",
          ...BUYER,
        },
      })
      expect(made.ok()).toBe(true)
      return ((await made.json()) as { number: string }).number
    }
    const open = async (number: string) => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByPlaceholder("Numéro, nom ou email").fill(number)
      await page.getByText(number).locator("visible=true").first().click()
      await expect(page.getByRole("heading", { name: number })).toBeVisible()
    }
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
