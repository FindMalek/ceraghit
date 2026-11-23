import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { localePath } from "../../helpers/locale"
import { deleteProductsByPrefix, fillLocalized, productRow, uniqueRef } from "../../helpers/products"
import { createProductWithImages, removeImages, uploadImage } from "../../support/media-upload"

const PREFIX = "e2e-j08-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

test("08 description: write it in French, add English and Arabic, see all three on the shop", async ({
  page,
  journey,
}) => {
  const ref = uniqueRef(PREFIX)
  const description = {
    fr: "Un bol tourné à la main, émail bleu profond.",
    en: "A hand-thrown bowl with a deep blue glaze.",
    ar: "وعاء مصنوع يدويا بطلاء أزرق عميق.",
  }
  await loginAsOwnerAndWait(page)
  const photo = await uploadImage(page, `j08-${ref}`, 320, 240)
  const id = await createProductWithImages(page, ref, [photo])
  await dbQuery("update products set status = 'published' where id = $1", [id])
  const url = (locale: "fr" | "en" | "ar", slug: string) => `${E2E.webUrl}${localePath(locale, `/product/${slug}`)}`

  await journey.step("Ouvrez la fiche du produit à modifier", async () => {
    await page.goto(`${E2E.dashboardUrl}/products/${id}`)
    await expect(page.getByLabel("Référence")).toHaveValue(ref)
    expect((await productRow(ref)).description).toBeNull()
  })

  await journey.step("Écrivez la description en français", async () => {
    await fillLocalized(page, "description", { fr: description.fr })
    await expect(page.locator("#description")).toHaveValue(description.fr)
  })

  await journey.step("Passez sur l'onglet English puis العربية et écrivez les traductions", async () => {
    await fillLocalized(page, "description", { en: description.en, ar: description.ar })
  })

  await journey.step("Enregistrez : les trois langues sont gardées", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await page.waitForURL(`${E2E.dashboardUrl}/products`)
    expect((await productRow(ref)).description).toEqual(description)
  })

  const { slug } = await productRow(ref)
  for (const locale of ["fr", "en", "ar"] as const) {
    await journey.step(`La boutique affiche la description en ${locale}`, async () => {
      await page.goto(url(locale, slug))
      await expect(page.getByText(description[locale]).first()).toBeVisible()
    })
  }

  await deleteProductsByPrefix(PREFIX)
  await removeImages(page, [photo])
})
