import { expect, test } from "../../fixtures"
import { fillCheckout, openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

test(
  "a delivery price that changed since the customer saw it is refused with a clear message, and the customer stays on the checkout",
  {
    tag: ["@desktop"],
  },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const submit = page.locator("form button[type=submit]")
    let stale = true

    await step("the customer sees a delivery price that is out of date", async () => {
      await page.route("**/shippingQuote**", async (route) => {
        try {
          const response = await route.fetch()
          const body = (await response.json()) as { json?: { amountMinor?: number } }
          if (stale && body.json?.amountMinor !== undefined) body.json.amountMinor += 1000
          await route.fulfill({ response, json: body })
        } catch {
          // the page moved on while the answer was in flight
        }
      })
      await openCheckout(page, { locale: appLocale, slug: piece.slug })
      await fillCheckout(page, { locale: appLocale, country: "TN", method: "cod" })
      await expect(submit).toBeEnabled()
    })

    await step("placing the order is refused because the real price differs", async () => {
      stale = false
      await submit.click()
      await expect(page.getByText(t(appLocale, "errors.api.shipping_changed")).first()).toBeVisible()
      await expect(page).toHaveURL(/checkout/)
    })
  },
)
