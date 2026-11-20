import { expect, test } from "../../fixtures"
import { fillCheckout, openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

test(
  "typing the city does not blank the delivery price or lock the pay button while the price reloads",
  { tag: ["@fr", "@desktop"] },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const pay = page.getByRole("button", { name: /^Payer/ })

    await step("the checkout shows the delivery price and the pay button", async () => {
      await openCheckout(page, { locale: appLocale, slug: piece.slug })
      await fillCheckout(page, { locale: appLocale, country: "TN" })
      await expect(pay).toBeEnabled()
    })

    await step("a slow price for a new city keeps the last price on screen and the button enabled", async () => {
      await page.route("**/shippingQuote**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        await route.continue()
      })
      const asked = page.waitForRequest(
        (r) => r.url().includes("shippingQuote") && (r.postData() ?? "").includes("Sfax"),
      )
      await page.getByLabel(t(appLocale, "checkout.city")).fill("Sfax")
      await asked
      // the answer takes 2.5 s: a button that is locked meanwhile must fail here, not recover by itself
      await expect(pay).toBeEnabled({ timeout: 500 })
      await expect(pay).toContainText(/\d/, { timeout: 500 })
    })
  },
)
