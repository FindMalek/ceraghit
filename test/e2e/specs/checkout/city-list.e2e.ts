import { expect, test } from "../../fixtures"
import { openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

test("a Tunisian customer picks the city from the list, and abroad it stays free text", async ({
  page,
  step,
  appLocale,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const city = page.getByLabel(t(appLocale, "checkout.city"), { exact: true })

  await step("typing a few letters shows the matching cities, accents and case ignored", async () => {
    await openCheckout(page, { locale: appLocale, slug: piece.slug })
    await city.fill("gabes")
    await expect(page.getByRole("option", { name: "Gabès" })).toBeVisible()
    await expect(page.getByRole("option")).toHaveCount(1)
  })

  await step("a word that matches nothing says so", async () => {
    await city.fill("zzzz")
    await expect(page.getByText(t(appLocale, "checkout.cityEmpty"))).toBeVisible()
  })

  await step("picking a city fills the field with the list's spelling", async () => {
    await city.fill("sou")
    await page.getByRole("option", { name: "Sousse" }).click()
    await expect(city).toHaveValue("Sousse")
  })

  await step("abroad the city is a plain text field", async () => {
    await page.getByLabel(t(appLocale, "checkout.country"), { exact: true }).selectOption("FR")
    await city.fill("Lyon")
    await expect(page.getByRole("option")).toHaveCount(0)
    await expect(city).toHaveValue("Lyon")
  })
})
