import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { catalogue, pickKinds } from "../../helpers/catalogue"
import { localePath } from "../../helpers/locale"
import { t } from "../../helpers/messages"

const LANGUAGES = { en: "English", ar: "العربية", fr: "Français" } as const

test("01 accueil: the home page, the languages, a product", async ({ page, journey, request, appLocale }) => {
  const { stocked } = pickKinds(await catalogue(request))

  await journey.step("Voici la page d'accueil de la boutique", async () => {
    await page.goto(E2E.webUrl)
    await expect(page.getByRole("heading", { level: 1, name: "Ceraghit" })).toBeVisible()
    await expect(page.getByText(t(appLocale, "home.kicker"))).toBeVisible()
  })

  await journey.step("Faites défiler pour voir les pièces à la une", async () => {
    const featured = page.getByRole("heading", { name: t(appLocale, "home.featured") })
    await featured.scrollIntoViewIfNeeded()
    await expect(featured).toBeVisible()
    expect(await page.getByRole("article").count()).toBeGreaterThan(0)
  })

  await journey.step("Puis les collections et l'atelier", async () => {
    const collections = page.getByRole("heading", { name: t(appLocale, "home.categories") })
    await collections.scrollIntoViewIfNeeded()
    await expect(collections).toBeVisible()
    const studio = page.getByRole("heading", { name: t(appLocale, "home.studio") })
    await studio.scrollIntoViewIfNeeded()
    await expect(studio).toBeVisible()
  })

  for (const locale of ["en", "ar", "fr"] as const) {
    await journey.step(`Le site existe aussi en ${LANGUAGES[locale]}`, async () => {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole("link", { name: LANGUAGES[locale], exact: true }).first().click()
      await expect(page).toHaveURL(`${E2E.webUrl}${localePath(locale, "/")}`)
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr")
    })
  }

  await journey.step("Ouvrez une pièce pour voir sa fiche", async () => {
    await page.goto(`${E2E.webUrl}/shop`)
    await page.getByRole("article").filter({ hasText: stocked.ref }).getByRole("link").first().click()
    await expect(page).toHaveURL(new RegExp(`/product/${stocked.slug}$`))
    await expect(page.getByRole("button", { name: t(appLocale, "product.add") })).toBeVisible()
  })
})
