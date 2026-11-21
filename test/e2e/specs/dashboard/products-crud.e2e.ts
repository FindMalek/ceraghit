import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { dbQuery, price } from "../../helpers/catalogue"
import { completeSetup, openDb } from "../../helpers/db"
import { type AppLocale, localePath } from "../../helpers/locale"
import { t } from "../../helpers/messages"
import {
  deleteProductsByPrefix,
  fillLocalized,
  firstCategoryName,
  type Localized,
  orderProduct,
  productExists,
  productRow,
  uniqueRef,
  variantRows,
} from "../../helpers/products"
import { forceCurrency } from "../../helpers/storefront"

const PREFIX = "e2e-crud-"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteProductsByPrefix(PREFIX)
})

test.afterAll(async () => {
  await deleteProductsByPrefix(PREFIX)
})

const storefront = (locale: AppLocale, slug: string) => `${E2E.webUrl}${localePath(locale, `/product/${slug}`)}`

interface NewProduct {
  ref: string
  title: Localized
  description?: Localized
  priceTnd?: string
  priceEur?: string
  stock?: string
}

async function fillProductForm(page: Page, product: NewProduct): Promise<void> {
  await page.getByLabel("Référence").fill(product.ref)
  await page.locator("#category").click()
  await page.getByRole("option", { name: await firstCategoryName() }).click()
  await fillLocalized(page, "title", product.title)
  if (product.description) await fillLocalized(page, "description", product.description)
  if (product.priceTnd !== undefined) await page.locator("#price-tnd").fill(product.priceTnd)
  if (product.priceEur !== undefined) await page.locator("#price-eur").fill(product.priceEur)
  if (product.stock !== undefined) await page.locator("#stock").fill(product.stock)
}

async function openNewProduct(page: Page): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/products/new`)
  await expect(page.getByLabel("Référence")).toBeVisible()
}

async function saveCreate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Créer le produit" }).click()
  await page.waitForURL(`${E2E.dashboardUrl}/products`)
}

async function saveEdit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await page.waitForURL(`${E2E.dashboardUrl}/products`)
}

/** Finds the row of one product in the list by its ref, the way the owner searches. */
async function searchList(page: Page, ref: string): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/products`)
  const rows = page.getByRole("link", { name: "Modifier" })
  await expect(rows.first()).toBeVisible()
  await page.getByPlaceholder("Référence ou nom").fill(ref)
  await expect(rows).toHaveCount(1)
}

async function openEdit(page: Page, ref: string): Promise<void> {
  await searchList(page, ref)
  await page.getByRole("link", { name: "Modifier" }).click()
  await expect(page.getByLabel("Référence")).toHaveValue(ref)
}

async function quickToggle(page: Page, ref: string, label: "Publier" | "Dépublier"): Promise<void> {
  await searchList(page, ref)
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/rpc/admin/products/update"),
  )
  await page.getByRole("button", { name: label, exact: true }).click()
  expect((await saved).ok()).toBe(true)
  await expect.poll(async () => (await productRow(ref)).status).toBe(label === "Publier" ? "published" : "draft")
}

test("a new piece saves both prices in their own unit and shows on the storefront in fr, en and ar", async ({
  page,
  step,
}) => {
  test.slow()
  const ref = uniqueRef(PREFIX)
  const title = { fr: `Vase test ${ref}`, en: `Test vase ${ref}`, ar: `مزهرية ${ref}` }
  const description = { fr: "Une pièce faite main.", en: "A handmade piece.", ar: "قطعة مصنوعة يدويا." }
  await loginAsOwnerAndWait(page)

  await step("fill the form with both prices", async () => {
    await openNewProduct(page)
    await fillProductForm(page, { ref, title, description, priceTnd: "185", priceEur: "59", stock: "4" })
    await page.getByLabel("Dimensions").fill("14 × 14 cm")
  })
  await step("save keeps whole minor units per currency", async () => {
    await saveCreate(page)
    const row = await productRow(ref)
    expect(row).toMatchObject({ status: "draft", priceTnd: 185000, priceEur: 5900, stock: 4, title, description })
  })
  await step("publish from the list", async () => {
    await quickToggle(page, ref, "Publier")
    await expect(page.getByRole("button", { name: "Dépublier", exact: true })).toBeVisible()
    expect((await productRow(ref)).status).toBe("published")
  })

  const { slug } = await productRow(ref)
  for (const locale of ["fr", "en", "ar"] as const) {
    await step(`the storefront shows the ${locale} title and each currency's own price`, async () => {
      await forceCurrency(page.context(), "TND")
      await page.goto(storefront(locale, slug))
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title[locale])
      await expect(page.getByText(price(185000, "TND", locale)).first()).toBeVisible()
      await expect(page.getByText(description[locale]).first()).toBeVisible()
      await forceCurrency(page.context(), "EUR")
      await page.goto(storefront(locale, slug))
      await expect(page.getByText(price(5900, "EUR", locale)).first()).toBeVisible()
    })
  }
})

test("a missing French title or price is refused with a French message and nothing is saved", async ({
  page,
  step,
}) => {
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)

  await step("no French title", async () => {
    await fillProductForm(page, { ref, title: { fr: "" }, priceTnd: "10", priceEur: "3" })
    await page.getByRole("button", { name: "Créer le produit" }).click()
    await expect(page.getByText("Le français est obligatoire.")).toBeVisible()
    await expect(page).toHaveURL(`${E2E.dashboardUrl}/products/new`)
    expect(await productExists(ref)).toBe(false)
  })
  await step("a price left empty", async () => {
    await fillLocalized(page, "title", { fr: `Titre ${ref}` })
    await page.locator("#price-eur").fill("")
    await page.getByRole("button", { name: "Créer le produit" }).click()
    await expect(page.getByText("Entrez un prix en euros (2 décimales maximum).")).toBeVisible()
    expect(await productExists(ref)).toBe(false)
  })
  await step("English and Arabic stay optional and the storefront falls back to French", async () => {
    await page.locator("#price-eur").fill("3")
    await saveCreate(page)
    await quickToggle(page, ref, "Publier")
    const row = await productRow(ref)
    expect(row.title).toEqual({ fr: `Titre ${ref}` })
    await page.goto(storefront("en", row.slug))
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Titre ${ref}`)
  })
})

test("editing changes only what was touched", async ({ page, step }) => {
  test.slow()
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, {
    ref,
    title: { fr: `Plat ${ref}` },
    description: { fr: "Description française." },
    priceTnd: "185",
    priceEur: "59",
    stock: "4",
  })
  await saveCreate(page)

  await step("change the euro price, the stock and the Arabic description", async () => {
    await openEdit(page, ref)
    await page.locator("#price-eur").fill("64")
    await page.locator("#stock").fill("2")
    await fillLocalized(page, "description", { ar: "وصف عربي." })
  })
  await step("only those fields changed in the database", async () => {
    await saveEdit(page)
    const row = await productRow(ref)
    expect(row).toMatchObject({ priceTnd: 185000, priceEur: 6400, stock: 2, status: "draft" })
    expect(row.description).toEqual({ fr: "Description française.", ar: "وصف عربي." })
    await quickToggle(page, ref, "Publier")
  })
  await step("the storefront keeps the dinar price and shows the new euro price and the Arabic text", async () => {
    const { slug } = await productRow(ref)
    await forceCurrency(page.context(), "TND")
    await page.goto(storefront("fr", slug))
    await expect(page.getByText(price(185000, "TND", "fr")).first()).toBeVisible()
    await forceCurrency(page.context(), "EUR")
    await page.goto(storefront("ar", slug))
    await expect(page.getByText(price(6400, "EUR", "ar")).first()).toBeVisible()
    await expect(page.getByText("وصف عربي.")).toBeVisible()
  })
})

async function addVariant(
  page: Page,
  index: number,
  variant: { label: Localized; tnd: string; eur: string; stock: string },
): Promise<void> {
  await page.getByRole("button", { name: "Ajouter une variante" }).click()
  await fillLocalized(page, `variant-${index}-label`, variant.label)
  await page.locator(`#variant-${index}-tnd`).fill(variant.tnd)
  await page.locator(`#variant-${index}-eur`).fill(variant.eur)
  await page.locator(`#variant-${index}-stock`).fill(variant.stock)
}

test("variants keep their prices, stock and order, survive the publish toggle and show on the storefront", async ({
  page,
  step,
}) => {
  test.slow()
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, { ref, title: { fr: `Bol ${ref}` } })

  await step("add three variants with labels in three languages", async () => {
    await addVariant(page, 0, {
      label: { fr: "Petit", en: "Small", ar: "صغير" },
      tnd: "40",
      eur: "12",
      stock: "3",
    })
    await addVariant(page, 1, { label: { fr: "Moyen" }, tnd: "55", eur: "17", stock: "2" })
    await addVariant(page, 2, { label: { fr: "Grand", en: "Large", ar: "كبير" }, tnd: "70", eur: "22", stock: "0" })
    await saveCreate(page)
    const row = await productRow(ref)
    expect(row).toMatchObject({ priceTnd: 40000, priceEur: 1200, stock: 5 })
    const variants = await variantRows(row.id)
    expect(variants.map((v) => v.label.fr)).toEqual(["Petit", "Moyen", "Grand"])
    expect(variants[0]).toMatchObject({
      label: { fr: "Petit", en: "Small", ar: "صغير" },
      priceTnd: 40000,
      priceEur: 1200,
    })
    expect(variants[2]).toMatchObject({ priceTnd: 70000, priceEur: 2200, stock: 0 })
  })

  const { id: productId } = await productRow(ref)
  const before = await variantRows(productId)
  await step("move one up and remove one", async () => {
    await openEdit(page, ref)
    await page.getByRole("button", { name: "Monter la variante" }).nth(2).click()
    await page.getByRole("button", { name: "Supprimer la variante" }).nth(2).click()
    await expect(page.getByRole("button", { name: "Supprimer la variante" })).toHaveCount(2)
    await saveEdit(page)
    const after = await variantRows(productId)
    expect(after.map((v) => v.label.fr)).toEqual(["Petit", "Grand"])
    expect(after.map((v) => v.id)).toEqual([before[0]?.id, before[2]?.id])
  })

  await step("unpublish then publish from the list keeps the same variants", async () => {
    const kept = await variantRows(productId)
    await quickToggle(page, ref, "Publier")
    await quickToggle(page, ref, "Dépublier")
    await quickToggle(page, ref, "Publier")
    expect((await productRow(ref)).status).toBe("published")
    expect(await variantRows(productId)).toEqual(kept)
  })

  await step("the storefront lists the options and marks the empty one sold out", async () => {
    const { slug } = await productRow(ref)
    await page.goto(storefront("fr", slug))
    const options = page.locator("label:has(input[name=variant])")
    await expect(options).toHaveCount(2)
    await expect(options.nth(0)).toContainText("Petit")
    await expect(options.nth(1)).toContainText("Grand")
    await expect(options.nth(1)).toContainText(t("fr", "product.variantSoldOut"))
    await page.goto(storefront("en", slug))
    await expect(page.locator("label:has(input[name=variant])").nth(0)).toContainText("Small")
  })
})

test("deleting a piece that was never ordered removes it and its page", async ({ page, step }) => {
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, { ref, title: { fr: `Tasse ${ref}` }, priceTnd: "20", priceEur: "6" })
  await saveCreate(page)
  await quickToggle(page, ref, "Publier")
  const { slug } = await productRow(ref)

  await step("the confirm dialog says what deleting does", async () => {
    await searchList(page, ref)
    await page.getByRole("button", { name: "Supprimer", exact: true }).click()
    await expect(page.getByRole("alertdialog")).toContainText(
      "Si elle a déjà été commandée, elle est archivée pour garder l'historique des commandes.",
    )
  })
  await step("confirming removes the row and the storefront page", async () => {
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0)
    expect(await productExists(ref)).toBe(false)
    const response = await page.goto(storefront("fr", slug))
    expect(response?.status()).toBe(404)
  })
})

test("deleting an ordered piece archives it and the order keeps its snapshot", async ({ page, request, step }) => {
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, { ref, title: { fr: `Coupe ${ref}` }, priceTnd: "30", priceEur: "9", stock: "2" })
  await saveCreate(page)
  await quickToggle(page, ref, "Publier")
  const { id, slug } = await productRow(ref)
  const orderNumber = await orderProduct(request, id)

  await step("delete asks for the same confirmation", async () => {
    await searchList(page, ref)
    await page.getByRole("button", { name: "Supprimer", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click()
  })
  await step("the piece is archived, off the storefront, and the order keeps its line", async () => {
    await expect(page.getByText("Archivé").first()).toBeVisible()
    expect((await productRow(ref)).status).toBe("archived")
    const response = await page.goto(storefront("fr", slug))
    expect(response?.status()).toBe(404)
    const lines = await dbQuery<{ ref: string; title: string; unitMinor: number }>(
      `select i.ref, i.title, i.unit_minor as "unitMinor" from order_items i join orders o on o.id = i.order_id where o.number = $1`,
      [orderNumber],
    )
    expect(lines).toEqual([{ ref, title: `Coupe ${ref}`, unitMinor: 30000 }])
  })
})

test("a description of 3000 characters saves and 3001 is refused", async ({ page, step }) => {
  const ref = uniqueRef(PREFIX)
  const long = (n: number) => "a".repeat(n)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, {
    ref,
    title: { fr: `Jarre ${ref}` },
    description: { fr: long(3001) },
    priceTnd: "10",
    priceEur: "3",
  })

  await step("3001 characters are refused", async () => {
    await page.getByRole("button", { name: "Créer le produit" }).click()
    await expect(page.getByText("Certains champs sont à corriger.")).toBeVisible()
    await expect(page.locator("#description")).toHaveAttribute("aria-invalid", "true")
    expect(await productExists(ref)).toBe(false)
  })
  await step("3000 characters save in full", async () => {
    await fillLocalized(page, "description", { fr: long(3000) })
    await saveCreate(page)
    expect((await productRow(ref)).description?.fr).toHaveLength(3000)
  })
})

test("line breaks of the description show on the storefront", async ({ page, step }) => {
  const ref = uniqueRef(PREFIX)
  await loginAsOwnerAndWait(page)
  await openNewProduct(page)
  await fillProductForm(page, {
    ref,
    title: { fr: `Pot ${ref}` },
    description: { fr: "Première ligne\nDeuxième ligne" },
    priceTnd: "10",
    priceEur: "3",
  })
  await saveCreate(page)
  await quickToggle(page, ref, "Publier")
  await step("the two lines stay on two lines", async () => {
    await page.goto(storefront("fr", (await productRow(ref)).slug))
    const text = await page.getByText("Première ligne").innerText()
    expect(text).toBe("Première ligne\nDeuxième ligne")
  })
})
