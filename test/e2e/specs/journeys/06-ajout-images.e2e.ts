import { basename } from "node:path"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { localePath } from "../../helpers/locale"
import { deleteProductsByPrefix, productRow } from "../../helpers/products"
import { createProductWithImages, drawnWebp, galleryNames, removeImages, uploadImage } from "../../support/media-upload"

const PREFIX = "e2e-j06-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

test("06 ajout images: from the library, upload a new one, reorder, choose the main one", async ({ page, journey }) => {
  test.slow()
  const id = Date.now().toString(36)
  const ref = `${PREFIX}${id}`.slice(0, 20)
  const file = (n: number) => `j06-${id}-${n}.webp`
  const ids: string[] = []
  await loginAsOwnerAndWait(page)
  for (let n = 1; n <= 3; n++) ids.push(await uploadImage(page, `j06-${id}-${n}`, 300 + n * 10, 220))
  const productId = await createProductWithImages(page, ref, [ids[0] as string])
  await dbQuery("update products set status = 'published' where id = $1", [productId])
  const gallery = page.getByRole("list", { name: "Photos du produit" }).getByRole("listitem")

  await journey.step("Ouvrez la fiche du produit : la galerie montre sa première photo", async () => {
    await page.goto(`${E2E.dashboardUrl}/products/${productId}`)
    await expect(gallery).toHaveCount(1)
  })

  await journey.step("Choisissez des photos dans la médiathèque", async () => {
    await page.getByRole("button", { name: "Choisir dans la médiathèque" }).click()
    const picker = page.getByRole("dialog", { name: "Choisir dans la médiathèque" })
    await picker.getByRole("searchbox", { name: "Rechercher une photo" }).fill(`j06-${id}`)
    await picker.getByRole("button", { name: file(2) }).click()
    await picker.getByRole("button", { name: "Choisir (1)" }).click()
    await expect(gallery).toHaveCount(2)
  })

  await journey.step("Ou envoyez une nouvelle photo depuis votre appareil", async () => {
    await page.getByRole("button", { name: "Envoyer des photos" }).click()
    const dialog = page.getByRole("dialog", { name: "Envoyer des photos" })
    const bytes = await drawnWebp(page, 400, 300)
    await dialog.locator('input[type="file"]').setInputFiles({
      name: `j06-${id}-4.webp`,
      mimeType: "image/webp",
      buffer: bytes,
    })
    await expect
      .poll(async () => (await dbQuery("select id from media where filename like $1", [`j06-${id}-4%`])).length)
      .toBe(1)
    await dialog.getByRole("button", { name: "Fermer" }).click()
    await expect(gallery).toHaveCount(3)
  })

  await journey.step("Changez l'ordre avec le menu de la photo", async () => {
    await page.getByRole("button", { name: "Actions pour la photo 3" }).click()
    await page.getByRole("menuitem", { name: "Monter" }).click()
    await expect(page.getByText("Photo 3 déplacée en position 2.")).toBeAttached()
  })

  await journey.step("L'étoile choisit la photo principale", async () => {
    await page.getByRole("button", { name: "Choisir comme photo principale" }).first().click()
    await expect(page.getByTestId("main-badge")).toHaveCount(1)
  })

  await journey.step("Enregistrez : l'ordre et la photo principale sont gardés", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await page.waitForURL(`${E2E.dashboardUrl}/products`)
    const names = await galleryNames(productId)
    expect(names).toHaveLength(3)
    expect(names[0]).toBe(file(1))
    expect(names[2]).toBe(file(2))
    expect(names[1]).toBe(`j06-${id}-4.webp`)
    const main = await dbQuery<{ key: string }>(
      `select m.key from product_images pi join media m on m.id = pi.media_id
       where pi.product_id = $1 and pi.is_main`,
      [productId],
    )
    expect(main).toHaveLength(1)
  })

  await journey.step("La galerie de la boutique suit cet ordre, photo principale en tête", async () => {
    const { slug } = await productRow(ref)
    await page.goto(`${E2E.webUrl}${localePath("fr", `/product/${slug}`)}`)
    const keys = await dbQuery<{ key: string }>(
      `select m.key from product_images pi join media m on m.id = pi.media_id
       where pi.product_id = $1 order by pi.is_main desc, pi.position`,
      [productId],
    )
    const html = await page.content()
    for (const { key } of keys) expect(html).toContain(basename(key))
    const first = page.getByRole("main").getByRole("img").first()
    await expect(first).toHaveAttribute(
      "src",
      new RegExp(encodeURIComponent(basename(keys[0]?.key ?? "")).slice(0, 20)),
    )
  })

  await deleteProductsByPrefix(PREFIX)
  const added = await dbQuery<{ id: string }>("select id from media where filename like $1", [`j06-${id}-%`])
  await removeImages(page, [...ids, ...added.map((m) => m.id)])
})
