import { EMAIL_COPY } from "../../../../packages/orpc/src/emails/copy"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, placeOrder, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { auditRows, orderId, orderRow } from "../../support/db"
import { mailWithSubject } from "../../support/mailpit"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test(
  "the owner sends the Payoneer link, the customer pays with it, and the confirmed payment keeps its reference",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const link = `https://link.payoneer.com/pay/e2e-${Date.now()}`
    let number = ""
    let token = ""

    const openOrder = async () => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByPlaceholder("Numéro, nom ou email").fill(number)
      await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    }

    await step("a new Payoneer order is flagged as waiting for its link", async () => {
      ;({ number, token } = await placeOrder(page, {
        locale: "fr",
        method: "payoneer",
        country: "FR",
        productSlug: piece.slug,
      }))
      await loginAsOwnerAndWait(page)
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByPlaceholder("Numéro, nom ou email").fill(number)
      await expect(page.getByText("Lien à envoyer").locator("visible=true").first()).toBeVisible()
    })

    await step("a link that is not from payoneer.com is refused and nothing is saved", async () => {
      await openOrder()
      await expect(page.getByRole("heading", { name: "Lien de paiement Payoneer" })).toBeVisible()
      await page.getByLabel("Lien Payoneer").fill("https://payoneer.com.evil.tld/pay")
      await page.getByRole("button", { name: "Envoyer au client" }).click()
      await expect(page.getByText("Collez un lien https de payoneer.com.")).toBeVisible()
      expect(await auditRows(number)).toEqual([])
    })

    await step("the link is saved, audited and emailed to the customer", async () => {
      await page.getByLabel("Lien Payoneer").fill(link)
      await page.getByRole("button", { name: "Envoyer au client" }).click()
      await expect(page.getByText(/Envoyé le/)).toBeVisible()
      await expect(page.getByRole("button", { name: "Remplacer le lien" })).toBeVisible()
      const [audit, ...more] = await auditRows(number)
      expect(more).toEqual([])
      expect(audit).toMatchObject({
        action: "payment_link_set",
        fromStatus: "pending_payment",
        toStatus: "pending_payment",
      })
      const mail = await mailWithSubject(EMAIL_COPY.fr.paymentLink.subject(number))
      expect(mail.text).toContain(link)
      expect((await orderRow(number)).status).toBe("pending_payment")
    })

    await step("the customer page offers the link and opening it never marks the order paid", async () => {
      await page.goto(`${E2E.webUrl}/order/${number}?t=${token}`)
      await expect(page.getByRole("link", { name: t("fr", "order.payoneerPay") })).toHaveAttribute("href", link)
      await expect(page.getByText(t("fr", "order.payoneerWaiting"))).toHaveCount(0)
      expect((await orderRow(number)).status).toBe("pending_payment")
    })

    await step("the owner confirms the payment and the invoice shows the reference he typed", async () => {
      await openOrder()
      await page.getByRole("button", { name: "Marquer payée", exact: true }).click()
      await page.getByLabel("Référence du paiement (facultatif)").fill("PAYONEER-REQ-9")
      await page.getByRole("button", { name: "Confirmer le paiement" }).click()
      await expect.poll(async () => (await orderRow(number)).status).toBe("paid")
      await page.goto(`${E2E.dashboardUrl}/invoice/${await orderId(number)}`)
      await expect(page.getByText("PAYONEER-REQ-9")).toBeVisible()
    })
  },
)
