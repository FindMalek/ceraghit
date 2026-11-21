import { siteImages } from "@workspace/db"
import { eq } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { fillLocalized } from "../../helpers/products"

let heroBefore: (typeof siteImages.$inferInsert)[] = []

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  heroBefore = await db.select().from(siteImages).where(eq(siteImages.slot, "hero"))
  await db.close()
})

// The hero is shared by every storefront spec: put it back whatever happened.
test.afterAll(async () => {
  const db = openDb()
  await db.delete(siteImages).where(eq(siteImages.slot, "hero"))
  if (heroBefore.length) await db.insert(siteImages).values(heroBefore)
  await db.close()
})

test("the owner reorders, describes and hides hero photos and the storefront follows", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  const hero = page.locator("#hero")
  const tiles = hero.getByTestId("hero-tile")
  const slides = () => page.locator("main img.object-cover.transition-opacity")
  let first = ""
  let visibleBefore = 0

  await step("open the site images page on the hero section", async () => {
    await page.goto(`${E2E.dashboardUrl}/site-images`)
    await expect(page.getByRole("heading", { name: "Images du site" })).toBeVisible()
    await expect(tiles.first()).toBeVisible()
    first = (await tiles.first().locator("img").getAttribute("src")) ?? ""
    visibleBefore = await hero.locator('[data-testid="hero-tile"][data-visible="true"]').count()
    await expect(hero.getByRole("button", { name: "Enregistrer" })).toBeDisabled()
  })

  await step("give the first photo a text and move it down", async () => {
    await hero.getByRole("button", { name: "Actions pour Photos d'accueil (diaporama) 1" }).click()
    await page.getByRole("menuitem", { name: "Texte alternatif…" }).click()
    await fillLocalized(page, "gallery-alt", { fr: "Vase bleu au soleil", ar: "مزهرية زرقاء" })
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click()
    await hero.getByRole("button", { name: "Actions pour Photos d'accueil (diaporama) 1" }).click()
    await page.getByRole("menuitem", { name: "Descendre" }).click()
    await expect(tiles.nth(1).locator("img")).toHaveAttribute("src", first)
    await expect(hero.getByText("Modifications non enregistrées")).toBeVisible()
  })

  await step("hide the third photo", async () => {
    await hero.getByRole("button", { name: "Actions pour Photos d'accueil (diaporama) 3" }).click()
    await page.getByRole("menuitem", { name: "Masquer" }).click()
    await expect(tiles.nth(2)).toHaveAttribute("data-visible", "false")
  })

  await step("save the section", async () => {
    await hero.getByRole("button", { name: "Enregistrer" }).click()
    await expect(hero.getByText("Images enregistrées.")).toBeVisible()
  })

  await step("the storefront shows the new order, the text and one slide less", async () => {
    await page.goto(`${E2E.webUrl}/fr`)
    await expect(slides()).toHaveCount(visibleBefore - 1)
    await expect(slides().nth(1)).toHaveAttribute("alt", "Vase bleu au soleil")
  })

  await step("the arabic storefront shows the arabic text", async () => {
    await page.goto(`${E2E.webUrl}/ar`)
    await expect(slides().nth(1)).toHaveAttribute("alt", "مزهرية زرقاء")
  })
})

test("the slideshow cannot be saved without a visible photo", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/site-images`)
  const hero = page.locator("#hero")
  await step("hide every photo", async () => {
    const tiles = hero.getByTestId("hero-tile")
    await expect(tiles.first()).toBeVisible()
    const count = await tiles.count()
    for (let i = 1; i <= count; i++) {
      if ((await tiles.nth(i - 1).getAttribute("data-visible")) === "false") continue
      await hero.getByRole("button", { name: `Actions pour Photos d'accueil (diaporama) ${i}` }).click()
      await page.getByRole("menuitem", { name: "Masquer" }).click()
      await expect(tiles.nth(i - 1)).toHaveAttribute("data-visible", "false")
    }
  })
  await step("the section explains why it cannot be saved", async () => {
    await expect(hero.getByText("Gardez au moins une photo visible dans le diaporama.")).toBeVisible()
    await expect(hero.getByRole("button", { name: "Enregistrer" })).toBeDisabled()
  })
})
