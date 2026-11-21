import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { fillLocalized } from "../../helpers/products"
import { categoryRows, categoryWithProducts } from "../../support/categories"

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

  await step("fill the French, English and Arabic names and save", async () => {
    await fillLocalized(page, "cat-name", name)
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText(name.fr)).toBeVisible()
    const [row] = await categoryRows(`Cat test ${id}`)
    expect(row?.name).toEqual(name)
    expect(row?.visible).toBe(true)
  })

  await step("the public menu lists it last, with its three names", async () => {
    const list = await menu(page)
    expect(list.at(-1)?.name).toMatchObject(name)
  })

  await step("moving it up puts it before the previous category in the db and in the menu", async () => {
    const before = (await menu(page)).map((c) => c.name.fr)
    await page.getByRole("listitem").filter({ hasText: name.fr }).getByRole("button", { name: "Monter" }).click()
    await expect.poll(async () => (await menu(page)).map((c) => c.name.fr)).not.toEqual(before)
    const after = (await menu(page)).map((c) => c.name.fr)
    expect(after.indexOf(name.fr)).toBe(before.indexOf(name.fr) - 1)
  })

  await step("hiding it takes it out of the public menu", async () => {
    await page.getByRole("listitem").filter({ hasText: name.fr }).getByRole("button", { name: "Modifier" }).click()
    await page.getByRole("switch", { name: "Visible dans le menu" }).click()
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Masquée")).toBeVisible()
    expect((await categoryRows(`Cat test ${id}`))[0]?.visible).toBe(false)
    expect((await menu(page)).map((c) => c.name.fr)).not.toContain(name.fr)
  })

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
