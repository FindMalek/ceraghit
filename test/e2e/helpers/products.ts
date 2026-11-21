import type { APIRequestContext, Page } from "@playwright/test"
import { E2E } from "../env"
import { dbQuery } from "./catalogue"

export interface Localized {
  fr: string
  en?: string
  ar?: string
}

type LocalizedPatch = Partial<Localized>

const LANGUAGE_TAB = { fr: "Français", en: "English", ar: "العربية" } as const

/** Fills the fr/en/ar tabs of one localized field of the dashboard form, by the id of its input. */
export async function fillLocalized(page: Page, id: string, values: LocalizedPatch): Promise<void> {
  const field = page.locator('[data-slot="field"]').filter({ has: page.locator(`#${id}`) })
  for (const language of ["fr", "en", "ar"] as const) {
    const text = values[language]
    if (text === undefined) continue
    await field.getByRole("tab", { name: LANGUAGE_TAB[language] }).click()
    await page.locator(`#${id}`).fill(text)
  }
}

/** A short unique suffix so specs and shards never collide on refs or slugs. */
export function uniqueRef(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 7)}`
}

export interface ProductRow {
  id: string
  slug: string
  status: string
  priceTnd: number
  priceEur: number
  stock: number
  title: Localized
  description: Localized | null
}

export async function productRow(ref: string): Promise<ProductRow> {
  const [row] = await dbQuery<ProductRow>(
    `select id, slug, status, price_tnd as "priceTnd", price_eur as "priceEur", stock, title, description
     from products where ref = $1`,
    [ref],
  )
  if (!row) throw new Error(`no product ${ref}`)
  return row
}

export async function productExists(ref: string): Promise<boolean> {
  const rows = await dbQuery<{ id: string }>("select id from products where ref = $1", [ref])
  return rows.length > 0
}

export interface VariantRow {
  id: string
  label: Localized
  priceTnd: number
  priceEur: number
  stock: number
}

/** Variants in the order the shop shows them. */
export async function variantRows(productId: string): Promise<VariantRow[]> {
  return dbQuery<VariantRow>(
    `select id, label, price_tnd as "priceTnd", price_eur as "priceEur", stock
     from product_variants where product_id = $1 order by position`,
    [productId],
  )
}

export async function firstCategoryName(): Promise<string> {
  const [row] = await dbQuery<{ name: string }>(
    "select name->>'fr' as name from categories order by position limit 1",
    [],
  )
  if (!row) throw new Error("the e2e seed has no category")
  return row.name
}

/** Removes the products a spec created and the orders it placed on them. */
export async function deleteProductsByPrefix(prefix: string): Promise<void> {
  const like = `${prefix}%`
  await dbQuery("delete from orders where id in (select order_id from order_items where ref like $1)", [like])
  await dbQuery("delete from products where ref like $1", [like])
}

/** Places a cod order for one piece straight on the public api, the way a buyer's checkout does. */
export async function orderProduct(request: APIRequestContext, productId: string): Promise<string> {
  const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId, quantity: 1 }],
      currency: "TND",
      locale: "fr",
      paymentMethod: "cod",
      country: "TN",
      customerName: "Test Client",
      email: "client@e2e.local",
      phone: "+21620000000",
      city: "Tunis",
      address: "1 rue de test",
    },
  })
  if (!res.ok()) throw new Error(`create order ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { number: string }).number
}
