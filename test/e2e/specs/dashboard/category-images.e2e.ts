import { categories } from "@workspace/db"
import { like } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { fillLocalized } from "../../helpers/products"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test.afterEach(async () => {
  const db = openDb()
  await db.delete(categories).where(like(categories.slug, "cat-image-test%"))
  await db.close()
})

test("a category picture is picked from the library, with no path field, and stored by media id", async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)
  const dialog = page.getByRole("dialog")

  await step("the category form has a picker and no path or url field", async () => {
    await page.goto(`${E2E.dashboardUrl}/categories`)
    await page.getByRole("button", { name: "Nouvelle catégorie" }).click()
    await expect(dialog.getByRole("button", { name: "Choisir une photo" })).toBeVisible()
    await expect(dialog.getByPlaceholder(/chemin|url|https/i)).toHaveCount(0)
  })

  await step("pick a photo from the library and save the category hidden", async () => {
    await fillLocalized(page, "cat-name", { fr: "Cat image test" })
    await page.getByRole("switch", { name: "Visible dans le menu" }).click()
    await dialog.getByRole("button", { name: "Choisir une photo" }).click()
    const picker = page.getByRole("dialog").last()
    await picker.locator("button[data-tile]").nth(3).click()
    await picker.getByRole("button", { name: "Choisir", exact: true }).click()
    await expect(dialog.getByRole("button", { name: "Changer la photo" })).toBeVisible()
    await dialog.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Cat image test")).toBeVisible()
  })

  await step("the category stores the media id and the picture", async () => {
    const db = openDb()
    const rows = await db.select().from(categories).where(like(categories.slug, "cat-image-test%"))
    await db.close()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.imageMediaId).toBeTruthy()
    expect(rows[0]?.image).toBeTruthy()
  })
})
