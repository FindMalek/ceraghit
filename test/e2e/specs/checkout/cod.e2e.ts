import { expect, orderMails, placeOrder, test } from "../../fixtures"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow, stockOf } from "../../support/db"

test("cash on delivery in Tunisia: TND totals, stock held, both mails sent", async ({
  page,
  step,
  appLocale,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const before = await stockOf(piece.id)
  let number = ""

  await step("place the order", async () => {
    ;({ number } = await placeOrder(page, { locale: appLocale, method: "cod", productSlug: piece.slug }))
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.codTitle"))
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.codText"))
  })

  await step("the order row, stock and page agree", async () => {
    const order = await orderRow(number)
    expect(order).toMatchObject({
      status: "pending_payment",
      currency: "TND",
      paymentMethod: "cod",
      paymentProvider: "cod",
      country: "TN",
      subtotalMinor: piece.prices.TND,
      paidAt: null,
    })
    expect(order.totalMinor).toBe(order.subtotalMinor + order.shippingMinor)
    expect(await stockOf(piece.id)).toBe(before - 1)
    await expect(page.locator("main")).not.toContainText("€")
  })

  await step("the customer and the studio were told", async () => {
    const { buyer, studio } = await orderMails(number)
    expect(buyer.text).not.toContain("€")
    expect(studio.text).toContain("Paiement en espèces")
    expect(studio.text).not.toContain("€")
  })
})
