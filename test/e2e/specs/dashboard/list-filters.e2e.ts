import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test("the reset button clears the product filters", { tag: ["@fr"] }, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/products`)
  const search = page.getByPlaceholder("Référence ou nom")
  const reset = page.getByRole("button", { name: "Réinitialiser les filtres" })

  await step("no reset button while nothing is filtered", async () => {
    await expect(page.getByRole("link", { name: "Modifier" }).first()).toBeVisible()
    await expect(reset).toHaveCount(0)
  })
  await step("a search with no match shows the reset button and no rows", async () => {
    await search.fill("zzz-no-such-product")
    await expect(reset).toBeVisible()
    await expect(page.getByText("Aucun produit ne correspond à ces filtres.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0)
  })
  await step("reset brings the rows back and hides itself", async () => {
    await reset.click()
    await expect(search).toHaveValue("")
    await expect(page.getByRole("link", { name: "Modifier" }).first()).toBeVisible()
    await expect(reset).toHaveCount(0)
  })
})
