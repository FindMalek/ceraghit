import { expect, placeOrder, test } from "../../fixtures"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow } from "../../support/db"

test("Payoneer from abroad: euro order waiting for the link, reference shown, no gateway", async ({
  page,
  step,
  appLocale,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  let number = ""

  await step("place the order with Payoneer", async () => {
    ;({ number } = await placeOrder(page, {
      locale: appLocale,
      method: "payoneer",
      country: "BE",
      productSlug: piece.slug,
    }))
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.payoneerTitle"))
  })

  await step("the page says the link is coming and shows the order number as the reference", async () => {
    await expect(page.getByText(t(appLocale, "order.payoneerWaiting"))).toBeVisible()
    const reference = page
      .locator("dt", { hasText: t(appLocale, "order.reference") })
      .locator("xpath=following-sibling::dd[1]")
    await expect(reference).toHaveText(number)
    await expect(page.getByRole("link", { name: t(appLocale, "order.payoneerPay") })).toHaveCount(0)
  })

  await step("the row is an unpaid euro order", async () => {
    expect(await orderRow(number)).toMatchObject({
      status: "pending_payment",
      currency: "EUR",
      paymentMethod: "payoneer",
      paidAt: null,
    })
  })
})
