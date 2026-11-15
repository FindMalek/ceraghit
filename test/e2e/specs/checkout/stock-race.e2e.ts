import { expect, test } from "../../fixtures"
import { fillCheckout, openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { uniquePiece } from "../../support/catalogue"
import { setStock, stockOf } from "../../support/db"

test("two buyers, one unique piece: the second is refused", { tag: ["@desktop"] }, async ({
  page,
  browser,
  step,
  appLocale,
}) => {
  const piece = await uniquePiece(page.request)
  await setStock(piece.id, 1)
  const other = await browser.newContext()
  await other.setExtraHTTPHeaders({ "x-forwarded-for": "10.200.200.7" })
  const second = await other.newPage()
  const submit = new RegExp(`^${t(appLocale, "checkout.placeOrder")}`)

  await step("both fill the checkout", async () => {
    for (const p of [page, second]) {
      await openCheckout(p, { locale: appLocale, slug: piece.slug })
      await fillCheckout(p, { locale: appLocale, country: "TN", method: "cod" })
    }
  })

  await step("the first order goes through", async () => {
    await page.getByRole("button", { name: submit }).click()
    await page.waitForURL(/\/order\/[^/?]+\?t=/)
    expect(await stockOf(piece.id)).toBe(0)
  })

  await step(
    "the second is told the piece is gone, no second order",
    async () => {
      await second.getByRole("button", { name: submit }).click()
      await expect(second.getByRole("alert").filter({ hasText: t(appLocale, "errors.api.out_of_stock") })).toBeVisible()
      await expect(second).toHaveURL(/\/checkout/)
      await expect(second).toHaveURL(/\/checkout/)
      expect(await stockOf(piece.id)).toBe(0)
    },
    second,
  )
  await other.close()
})
