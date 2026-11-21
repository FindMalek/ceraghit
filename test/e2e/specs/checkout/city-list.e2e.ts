import { expect, test } from "../../fixtures"
import { openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

test("a Tunisian customer gets the city list as suggestions, and abroad it stays free text", async ({
  page,
  step,
  appLocale,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const city = page.getByLabel(t(appLocale, "checkout.city"), { exact: true })
  const suggestions = page.locator("#city-options option")

  await step("typing a few letters narrows the suggestions, accents and case ignored", async () => {
    await openCheckout(page, { locale: appLocale, slug: piece.slug })
    await city.fill("gabes")
    await expect(suggestions).toHaveCount(1)
    await expect(suggestions.first()).toHaveAttribute("value", "Gabès")
  })

  await step("a word that matches nothing says so", async () => {
    await city.fill("zzzz")
    await expect(page.getByText(t(appLocale, "checkout.cityEmpty"))).toBeVisible()
  })

  await step("an unknown city is refused by the server and the customer is told to pick one", async () => {
    await page.getByLabel(t(appLocale, "checkout.name")).fill("Test Client")
    await page.getByLabel(t(appLocale, "checkout.email")).fill("client@e2e.local")
    await page.getByLabel(t(appLocale, "checkout.phone")).fill("+21620000000")
    await page.getByRole("checkbox").check()
    await page.getByLabel(t(appLocale, "checkout.address"), { exact: true }).fill("1 rue de test")
    await page.getByLabel(t(appLocale, "checkout.address"), { exact: true }).press("Enter")
    await expect(page.locator("#city-error")).toContainText(t(appLocale, "checkout.errors.cityList"))
  })

  await step("abroad the city is a plain text field with no suggestions", async () => {
    await page.getByLabel(t(appLocale, "checkout.country"), { exact: true }).selectOption("FR")
    await city.fill("Lyon")
    await expect(suggestions).toHaveCount(0)
    await expect(city).toHaveValue("Lyon")
  })
})
