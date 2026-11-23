import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { pieceFor } from "../../support/catalogue"
import { orderId, orderRow } from "../../support/db"
import { deleteInvoicedOrdersLike, invoiceOf } from "../../support/invoices"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test("10 facture: from an order to its invoice, the print view and the customer's own link", async ({
  page,
  request,
  journey,
}, testInfo) => {
  const piece = await pieceFor(request, testInfo)
  const made = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: piece.id, quantity: 1 }],
      currency: "TND",
      locale: "fr",
      paymentMethod: "cod",
      country: "TN",
      ...BUYER,
    },
  })
  expect(made.ok()).toBe(true)
  const order = (await made.json()) as { number: string; token: string }
  await loginAsOwnerAndWait(page)
  await page.addInitScript(() => {
    ;(window as unknown as { printed: number }).printed = 0
    window.print = () => {
      ;(window as unknown as { printed: number }).printed++
    }
  })

  await journey.step("Dans Commandes, ouvrez la commande", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(order.number)
    await page.getByText(order.number, { exact: true }).locator("visible=true").first().click()
    await expect(page.getByRole("heading", { name: order.number, exact: true })).toBeVisible()
  })

  await journey.step("Marquez-la expédiée : la facture reçoit son numéro", async () => {
    await page.getByRole("button", { name: "Marquer expédiée", exact: true }).click()
    await page.getByRole("button", { name: "Confirmer l'expédition" }).click()
    await expect.poll(async () => (await orderRow(order.number)).status).toBe("fulfilled")
    await expect.poll(() => invoiceOf(order.number)).not.toBeNull()
  })

  await journey.step("Cliquez sur Facture pour l'ouvrir", async () => {
    const id = await orderId(order.number)
    await page.getByText(order.number, { exact: true }).locator("visible=true").first().click()
    const link = page.getByRole("link", { name: "Facture", exact: true })
    await expect(link).toHaveAttribute("href", `/invoice/${id}`)
    await page.goto(`${E2E.dashboardUrl}/invoice/${id}`)
    const invoice = await invoiceOf(order.number)
    await expect(page.locator("article.invoice")).toContainText(`${invoice?.number}`)
  })

  await journey.step("Imprimer ou enregistrer en PDF ouvre l'aperçu d'impression", async () => {
    await page.goto(`${E2E.dashboardUrl}/invoice/${await orderId(order.number)}`)
    await page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" }).click()
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1)
  })

  await journey.step("Votre client retrouve sa facture depuis la page de sa commande", async () => {
    await page.goto(`${E2E.webUrl}/order/${order.number}?t=${encodeURIComponent(order.token)}`)
    await page.getByRole("link", { name: "Voir la facture" }).click()
    const invoice = await invoiceOf(order.number)
    await expect(page).toHaveURL(new RegExp(`/order/${order.number}/invoice`))
    await expect(page.locator("article.invoice")).toContainText(`${invoice?.number}`)
  })

  await deleteInvoicedOrdersLike(order.number)
})
