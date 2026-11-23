import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { price } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { localePath } from "../../helpers/locale"
import { deleteProductsByPrefix, productRow, uniqueRef, variantRows } from "../../helpers/products"
import { forceCurrency } from "../../helpers/storefront"
import { addVariant, fillProductForm, openNewProduct, quickToggle, saveCreate } from "../../support/product-form"

const PREFIX = "e2e-j04-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

test("04 ajout produit: a new piece in three languages and two currencies, published", async ({ page, journey }) => {
  test.slow()
  const ref = uniqueRef(PREFIX)
  const title = { fr: `Vase bleu ${ref}`, en: `Blue vase ${ref}`, ar: `مزهرية زرقاء ${ref}` }
  const description = { fr: "Une pièce faite main.", en: "A handmade piece.", ar: "قطعة مصنوعة يدويا." }
  await loginAsOwnerAndWait(page)

  await journey.step("Ouvrez Produits, puis Nouveau produit", async () => {
    await openNewProduct(page)
  })

  await journey.step("Saisissez la référence, la catégorie et le titre en français, anglais et arabe", async () => {
    await fillProductForm(page, { ref, title, description, priceTnd: "185", priceEur: "59", stock: "4" })
    await expect(page.getByLabel("Référence")).toHaveValue(ref)
  })

  await journey.step("Les prix en dinars et en euros sont deux champs distincts, avec le stock", async () => {
    await expect(page.locator("#price-tnd")).toHaveValue("185")
    await expect(page.locator("#price-eur")).toHaveValue("59")
    await expect(page.locator("#stock")).toHaveValue("4")
  })

  await journey.step("Ajoutez une variante avec son propre prix et son stock", async () => {
    await addVariant(page, 0, { label: { fr: "Petit", en: "Small", ar: "صغير" }, tnd: "120", eur: "39", stock: "2" })
    await addVariant(page, 1, { label: { fr: "Grand", en: "Large", ar: "كبير" }, tnd: "185", eur: "59", stock: "2" })
  })

  await journey.step("Créez le produit : il est enregistré en brouillon", async () => {
    await saveCreate(page)
    const row = await productRow(ref)
    expect(row).toMatchObject({ status: "draft", priceTnd: 120000, priceEur: 3900, stock: 4, title })
    expect((await variantRows(row.id)).map((v) => v.label.fr)).toEqual(["Petit", "Grand"])
  })

  await journey.step("Publiez-le depuis la liste", async () => {
    await quickToggle(page, ref, "Publier")
    await expect(page.getByRole("button", { name: "Dépublier", exact: true })).toBeVisible()
  })

  const { slug } = await productRow(ref)
  await journey.step("Il apparaît sur la boutique avec son prix dans chaque monnaie", async () => {
    await forceCurrency(page.context(), "TND")
    await page.goto(`${E2E.webUrl}${localePath("fr", `/product/${slug}`)}`)
    await expect(page.getByText(price(120000, "TND", "fr")).first()).toBeVisible()
    await forceCurrency(page.context(), "EUR")
    await page.goto(`${E2E.webUrl}${localePath("fr", `/product/${slug}`)}`)
    await expect(page.getByText(price(3900, "EUR", "fr")).first()).toBeVisible()
  })

  await journey.step("Et dans les trois langues", async () => {
    for (const locale of ["fr", "en", "ar"] as const) {
      await page.goto(`${E2E.webUrl}${localePath(locale, `/product/${slug}`)}`)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title[locale])
      await expect(page.getByText(description[locale]).first()).toBeVisible()
    }
  })
})
