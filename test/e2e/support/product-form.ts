import type { Page } from "@playwright/test"
import { E2E } from "../env"
import { expect } from "../fixtures"
import { fillLocalized, firstCategoryName, type Localized, productRow } from "../helpers/products"

export interface NewProduct {
  ref: string
  title: Localized
  description?: Localized
  priceTnd: string
  priceEur: string
  stock: string
}

/** The dashboard product form, filled the way the owner does. */
export async function fillProductForm(page: Page, product: NewProduct): Promise<void> {
  await page.getByLabel("Référence").fill(product.ref)
  await page.locator("#category").click()
  await page.getByRole("option", { name: await firstCategoryName() }).click()
  await fillLocalized(page, "title", product.title)
  if (product.description) await fillLocalized(page, "description", product.description)
  await page.locator("#price-tnd").fill(product.priceTnd)
  await page.locator("#price-eur").fill(product.priceEur)
  await page.locator("#stock").fill(product.stock)
}

export async function openNewProduct(page: Page): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/products/new`)
  await expect(page.getByLabel("Référence")).toBeVisible()
}

export async function saveCreate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Créer le produit" }).click()
  await page.waitForURL(`${E2E.dashboardUrl}/products`)
}

export async function saveEdit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await page.waitForURL(`${E2E.dashboardUrl}/products`)
}

/** Finds one product in the list by its ref, the way the owner searches. */
export async function searchList(page: Page, ref: string): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/products`)
  const rows = page.getByRole("link", { name: "Modifier" })
  await expect(rows.first()).toBeVisible()
  await page.getByPlaceholder("Référence ou nom").fill(ref)
  await expect(rows).toHaveCount(1)
}

export async function openEdit(page: Page, ref: string): Promise<void> {
  await searchList(page, ref)
  await page.getByRole("link", { name: "Modifier" }).click()
  await expect(page.getByLabel("Référence")).toHaveValue(ref)
}

export async function quickToggle(page: Page, ref: string, label: "Publier" | "Dépublier"): Promise<void> {
  await searchList(page, ref)
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/rpc/admin/products/update"),
  )
  await page.getByRole("button", { name: label, exact: true }).click()
  expect((await saved).ok()).toBe(true)
  await expect.poll(async () => (await productRow(ref)).status).toBe(label === "Publier" ? "published" : "draft")
}

export async function addVariant(
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
