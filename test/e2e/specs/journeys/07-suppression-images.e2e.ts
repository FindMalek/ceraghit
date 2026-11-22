import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { deleteProductsByPrefix } from "../../helpers/products"
import { mediaById } from "../../support/media"
import { ADMIN, createProductWithImages, galleryNames, removeImages, uploadImage } from "../../support/media-upload"

const PREFIX = "e2e-j07-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

test("07 suppression images: remove a photo from a product, a used photo is protected, an unused one is deleted", async ({
  page,
  journey,
}) => {
  test.slow()
  const id = Date.now().toString(36)
  const ref = `${PREFIX}${id}`.slice(0, 20)
  const file = (n: number) => `j07-${id}-${n}.webp`
  const ids: string[] = []
  await loginAsOwnerAndWait(page)
  for (let n = 1; n <= 2; n++) ids.push(await uploadImage(page, `j07-${id}-${n}`, 300 + n * 10, 220))
  const productId = await createProductWithImages(page, ref, ids)
  const gallery = page.getByRole("list", { name: "Photos du produit" }).getByRole("listitem")
  const tile = (name: string) => page.getByRole("button", { name: `${name}, ouvrir` })
  const panel = page.getByRole("dialog", { name: "Détail de la photo" })

  await journey.step("Ouvrez la fiche du produit : deux photos", async () => {
    await page.goto(`${E2E.dashboardUrl}/products/${productId}`)
    await expect(gallery).toHaveCount(2)
  })

  await journey.step("Dans le menu de la photo 1, choisissez Retirer", async () => {
    await page.getByRole("button", { name: "Actions pour la photo 1" }).click()
    await page.getByRole("menuitem", { name: "Retirer" }).click()
    await expect(gallery).toHaveCount(1)
  })

  await journey.step("Enregistrez : la photo n'est plus sur le produit mais reste dans la médiathèque", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await page.waitForURL(`${E2E.dashboardUrl}/products`)
    expect(await galleryNames(productId)).toEqual([file(2)])
    expect(await mediaById(ids[0] as string)).not.toBeNull()
  })

  await journey.step("Dans la médiathèque, une photo utilisée ne peut pas être supprimée", async () => {
    await page.goto(`${E2E.dashboardUrl}/media?q=j07-${id}`)
    await tile(file(2)).click()
    await expect(panel.getByText("Utilisée sur 1 page : retirez-la d'abord.")).toBeVisible()
    await expect(panel.getByRole("button", { name: "Supprimer" })).toBeDisabled()
    const refused = await page.request.delete(`${E2E.apiUrl}/v1/admin/media/${ids[1]}`, { headers: ADMIN })
    expect(refused.status()).toBe(409)
    expect(await mediaById(ids[1] as string)).not.toBeNull()
    await page.keyboard.press("Escape")
  })

  await journey.step("La photo retirée n'est plus utilisée : supprimez-la, après confirmation", async () => {
    await tile(file(1)).click()
    await expect(panel.getByText("Nulle part pour le moment.")).toBeVisible()
    await panel.getByRole("button", { name: "Supprimer" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
    await expect.poll(() => mediaById(ids[0] as string)).toBeNull()
    await expect(tile(file(1))).toBeHidden()
  })

  await deleteProductsByPrefix(PREFIX)
  await removeImages(page, ids)
})
