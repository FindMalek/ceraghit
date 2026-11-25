import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { localePath } from "../../helpers/locale"
import { deleteProductsByPrefix, productExists, productRow, uniqueRef } from "../../helpers/products"
import { createProductWithImages } from "../../support/media-upload"
import { searchList } from "../../support/product-form"

const PREFIX = "e2e-j05-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

test("05 suppression produit: a piece nobody ordered is deleted and leaves the shop", async ({ page, journey }) => {
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  const id = await createProductWithImages(page, ref, [])
  await dbQuery("update products set status = 'published' where id = $1", [id])
  const { slug } = await productRow(ref)
  const url = `${E2E.webUrl}${localePath("fr", `/product/${slug}`)}`

  await journey.step("La pièce est visible sur la boutique", async () => {
    const response = await page.goto(url)
    expect(response?.status()).toBe(200)
  })

  await journey.step("Dans Produits, cherchez la pièce par sa référence", async () => {
    await searchList(page, ref)
  })

  await journey.step("Cliquez sur Supprimer : une confirmation explique ce qui va se passer", async () => {
    await page.getByRole("button", { name: "Supprimer", exact: true }).click()
    await expect(page.getByRole("alertdialog")).toContainText(
      "Si elle a déjà été commandée, elle est archivée pour garder l'historique des commandes.",
    )
  })

  await journey.step("Confirmez : la ligne disparaît de la liste", async () => {
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0)
    expect(await productExists(ref)).toBe(false)
  })

  await journey.step("Sur la boutique, la page de la pièce n'existe plus", async () => {
    const response = await page.goto(url)
    expect(response?.status()).toBe(404)
  })
})
