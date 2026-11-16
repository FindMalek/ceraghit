import AxeBuilder from "@axe-core/playwright"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test("the product gallery is accessible and photos reorder with the menu", { tag: ["@fr"] }, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await step("open a product", async () => {
    await page.goto(`${E2E.dashboardUrl}/products`)
    await page.locator('a[href^="/products/"]:not([href="/products/new"])').first().click()
    await expect(page.getByRole("list", { name: "Photos du produit" })).toBeVisible()
  })
  await step("the gallery has no serious accessibility violation", async () => {
    const { violations } = await new AxeBuilder({ page }).include('ul[aria-label="Photos du produit"]').analyze()
    expect(violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([])
  })
  await step("a photo moves down with the menu and the move is announced", async () => {
    const tiles = page.getByRole("list", { name: "Photos du produit" }).getByRole("listitem")
    const first = await tiles.first().locator("img").getAttribute("src")
    await page.getByRole("button", { name: "Actions pour la photo 1" }).click()
    await page.getByRole("menuitem", { name: "Descendre" }).click()
    await expect(tiles.nth(1).locator("img")).toHaveAttribute("src", first ?? "")
    await expect(page.getByText("Photo 1 déplacée en position 2.")).toBeAttached()
  })
  await step("the star sets one main photo", async () => {
    await page.getByRole("button", { name: "Choisir comme photo principale" }).first().click()
    await expect(page.getByTestId("main-badge")).toHaveCount(1)
  })
})
