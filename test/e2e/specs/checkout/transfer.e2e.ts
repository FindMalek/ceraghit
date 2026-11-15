import { expect, mailWithSubject, placeOrder, test } from "../../fixtures"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow, stockOf } from "../../support/db"

for (const country of ["FR", "BE"] as const) {
  test(`bank transfer from ${country}: EUR totals, bank block and reference`, async ({
    page,
    step,
    appLocale,
  }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""

    await step("place the order", async () => {
      ;({ number } = await placeOrder(page, {
        locale: appLocale,
        method: "transfer",
        country,
        productSlug: piece.slug,
      }))
      await expect(page.getByRole("status")).toContainText(t(appLocale, "order.transferTitle"))
    })

    await step("the page shows the bank block and the order number as the reference", async () => {
      await expect(page.getByRole("heading", { name: t(appLocale, "order.bankTitle") })).toBeVisible()
      const reference = page
        .locator("dt", { hasText: t(appLocale, "order.reference") })
        .locator("xpath=following-sibling::dd[1]")
      await expect(reference).toHaveText(number)
      await expect(page.locator("dt", { hasText: t(appLocale, "order.iban") })).toBeVisible()
    })

    await step("the row is in EUR, built from the EUR price", async () => {
      const order = await orderRow(number)
      expect(order).toMatchObject({
        status: "pending_payment",
        currency: "EUR",
        paymentMethod: "transfer",
        country,
        subtotalMinor: piece.prices.EUR,
      })
      expect(order.shippingMinor).toBeGreaterThan(0)
      expect(order.totalMinor).toBe(order.subtotalMinor + order.shippingMinor)
      expect(await stockOf(piece.id)).toBe(before - 1)
      await expect(page.locator("main")).not.toContainText("DT")
    })

    await step("the confirmation mail carries the same reference", async () => {
      const mail = await mailWithSubject(number)
      expect(mail.subject).toContain(number)
    })
  })
}
