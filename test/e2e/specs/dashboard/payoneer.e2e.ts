import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, placeOrder, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { auditRows, orderRow, stockOf } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test(
  "a Payoneer order waits for the owner, who confirms it with an audited manual payment",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""
    let token = ""

    await step("the customer abroad picks Payoneer and sees the reference and the euro total", async () => {
      ;({ number, token } = await placeOrder(page, {
        locale: "fr",
        method: "payoneer",
        country: "FR",
        productSlug: piece.slug,
      }))
      await expect(page.getByRole("status")).toContainText(t("fr", "order.payoneerTitle"))
      await expect(page.getByText(t("fr", "order.payoneerWaiting"))).toBeVisible()
      await expect(page.getByRole("heading", { name: t("fr", "order.payoneerHeading") })).toBeVisible()
      await expect(
        page.locator("dt", { hasText: t("fr", "order.reference") }).locator("xpath=following-sibling::dd[1]"),
      ).toHaveText(number)
      await expect(page.locator("main")).not.toContainText("DT")
      const order = await orderRow(number)
      expect(order).toMatchObject({
        status: "pending_payment",
        currency: "EUR",
        paymentMethod: "payoneer",
        paymentProvider: "payoneer",
        paidAt: null,
      })
      expect(await stockOf(piece.id)).toBe(before - 1)
    })

    await step("the owner sees the Payoneer card in the payment settings", async () => {
      await loginAsOwnerAndWait(page)
      await page.goto(`${E2E.dashboardUrl}/payments`)
      await expect(page.getByRole("heading", { name: "Payoneer" })).toBeVisible()
      await expect(page.getByText("Un lien par commande (recommandé)")).toBeVisible()
    })

    await step("opening the order page again never marks it paid", async () => {
      await page.goto(`${E2E.webUrl}/order/${number}?t=${token}`)
      await expect(page.getByRole("status")).toContainText(t("fr", "order.payoneerTitle"))
      expect((await orderRow(number)).status).toBe("pending_payment")
    })

    await step("the owner marks it paid with Payoneer preset and the audit row says so", async () => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByPlaceholder("Numéro, nom ou email").fill(number)
      await page.getByText(number, { exact: true }).locator("visible=true").first().click()
      await page.getByRole("button", { name: "Marquer payée", exact: true }).click()
      await expect(page.getByLabel("Reçu par")).toContainText("Payoneer")
      await page.getByLabel("Référence du paiement (facultatif)").fill("PAYONEER-REQ-1")
      await page.getByRole("button", { name: "Confirmer le paiement" }).click()
      await expect.poll(async () => (await orderRow(number)).status).toBe("paid")
      const [audit, ...more] = await auditRows(number)
      expect(more).toEqual([])
      expect(audit).toMatchObject({
        action: "mark_paid_manually",
        fromStatus: "pending_payment",
        toStatus: "paid",
        method: "payoneer",
        reference: "PAYONEER-REQ-1",
      })
      expect(audit?.adminId).not.toBeNull()
    })

    await step("the customer page no longer shows the Payoneer block", async () => {
      await page.goto(`${E2E.webUrl}/order/${number}?t=${token}`)
      await expect(page.getByRole("status")).toContainText(t("fr", "order.status.paid"))
      await expect(page.getByRole("heading", { name: t("fr", "order.payoneerHeading") })).toHaveCount(0)
    })
  },
)
