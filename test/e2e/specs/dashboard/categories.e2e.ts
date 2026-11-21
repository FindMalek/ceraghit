import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { fillLocalized } from "../../helpers/products"
import { categoryRows, categoryWithProducts, deleteCategories } from "../../support/categories"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

interface PublicCategory {
  id: string
  name: { fr: string; en?: string; ar?: string }
}

async function menu(page: Page): Promise<PublicCategory[]> {
  const res = await page.request.get(`${E2E.apiUrl}/v1/categories`)
  expect(res.ok()).toBe(true)
  return (await res.json()) as PublicCategory[]
}

async function openDialog(page: Page): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/categories`)
  await page.getByRole("button", { name: "Nouvelle catégorie" }).click()
  await expect(page.getByRole("heading", { name: "Nouvelle catégorie" })).toBeVisible()
}

test.afterEach(async () => {
  await deleteCategories("Cat test")
})

test("the owner creates a category in three languages, hides it, moves it and deletes it", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  const id = Date.now().toString(36)
  const name = { fr: `Cat test ${id}`, en: `Test cat ${id}`, ar: `فئة ${id}` }
  await loginAsOwnerAndWait(page)

  await step("a category without a French name is refused and nothing is saved", async () => {
    await openDialog(page)
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Le nom en français est obligatoire.")).toBeVisible()
    expect(await categoryRows("Cat test")).toHaveLength(0)
  })

  await step("fill the three names and save it hidden, so no other spec ever sees it", async () => {
    await fillLocalized(page, "cat-name", name)
    await page.getByRole("switch", { name: "Visible dans le menu" }).click()
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText(name.fr)).toBeVisible()
    const [row] = await categoryRows(`Cat test ${id}`)
    expect(row?.name).toEqual(name)
    expect(row?.visible).toBe(false)
    expect((await menu(page)).map((c) => c.name.fr)).not.toContain(name.fr)
  })

  await step("moving it up changes its position by one place", async () => {
    const position = async () => (await categoryRows(`Cat test ${id}`))[0]?.position ?? 0
    const before = await position()
    await page.getByRole("listitem").filter({ hasText: name.fr }).getByRole("button", { name: "Monter" }).click()
    await expect.poll(position).toBeLessThan(before)
  })

  await step(
    "made visible for one check, the public menu lists it with its three names, then it is hidden again",
    async () => {
      const card = page.getByRole("listitem").filter({ hasText: name.fr })
      await card.getByRole("button", { name: "Modifier" }).click()
      await page.getByRole("switch", { name: "Visible dans le menu" }).click()
      await page.getByRole("button", { name: "Enregistrer" }).click()
      await expect(page.getByText("Masquée")).toHaveCount(0)
      expect((await menu(page)).find((c) => c.name.fr === name.fr)?.name).toMatchObject(name)
      await card.getByRole("button", { name: "Modifier" }).click()
      await page.getByRole("switch", { name: "Visible dans le menu" }).click()
      await page.getByRole("button", { name: "Enregistrer" }).click()
      await expect(page.getByText("Masquée")).toBeVisible()
      expect((await menu(page)).map((c) => c.name.fr)).not.toContain(name.fr)
    },
  )

  await step("an empty category is deleted after a confirmation", async () => {
    await page.getByRole("listitem").filter({ hasText: name.fr }).getByRole("button", { name: "Supprimer" }).click()
    await expect(page.getByRole("alertdialog")).toContainText(
      "ne peut être supprimée que si elle ne contient plus aucun produit",
    )
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
    await expect(page.getByText(name.fr)).toHaveCount(0)
    expect(await categoryRows(`Cat test ${id}`)).toHaveLength(0)
  })

  await step("a category that still holds products cannot be deleted", async () => {
    const full = await categoryWithProducts()
    const res = await page.request.delete(`${E2E.apiUrl}/v1/admin/categories/${full}`, {
      headers: { "x-csrf-token": "orpc" },
    })
    expect(res.status()).toBe(409)
    expect((await menu(page)).map((c) => c.id)).toContain(full)
  })
})
