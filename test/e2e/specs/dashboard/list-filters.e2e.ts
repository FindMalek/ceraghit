import { sql } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test("the reset button clears the product filters", { tag: ["@fr"] }, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/products`)
  const search = page.getByPlaceholder("Référence ou nom")
  const reset = page.getByRole("button", { name: "Réinitialiser les filtres" })

  await step("no reset button while nothing is filtered", async () => {
    await expect(page.getByRole("link", { name: "Modifier" }).first()).toBeVisible()
    await expect(reset).toHaveCount(0)
  })
  await step("a search with no match shows the reset button and no rows", async () => {
    await search.fill("zzz-no-such-product")
    await expect(reset).toBeVisible()
    await expect(page.getByText("Aucun produit ne correspond à ces filtres.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0)
  })
  await step("reset brings the rows back and hides itself", async () => {
    await reset.click()
    await expect(search).toHaveValue("")
    await expect(page.getByRole("link", { name: "Modifier" }).first()).toBeVisible()
    await expect(reset).toHaveCount(0)
  })
})

test("the product list shows 40 rows and loads the rest on demand", { tag: ["@fr"] }, async ({ page, step }) => {
  const db = openDb()
  await db.execute(sql`delete from products where ref like 'zz-%'`)
  await db.execute(sql`
    insert into products (ref, slug, category_id, title, price_tnd, price_eur, stock, status)
    select 'zz-' || g, 'zz-load-more-' || g, (select id from categories limit 1), '{"fr":"Pièce de test"}'::jsonb, 1000, 300, 1, 'draft'
    from generate_series(1, 15) g`)
  try {
    const rows = page.getByRole("link", { name: "Modifier" })
    const more = page.getByRole("button", { name: "Voir plus de produits" })
    await loginAsOwnerAndWait(page)
    await page.goto(`${E2E.dashboardUrl}/products`)

    await step("the first page holds 40 products and offers more", async () => {
      await expect(rows).toHaveCount(40)
      await expect(more).toBeVisible()
    })
    await step("a filter goes back to the first page of the new result", async () => {
      await page.getByPlaceholder("Référence ou nom").fill("Pièce de test")
      await expect(rows).toHaveCount(15)
      await expect(more).toHaveCount(0)
    })
    await step("clearing the filter and loading more shows every product", async () => {
      await page.getByRole("button", { name: "Réinitialiser les filtres" }).click()
      await expect(rows).toHaveCount(40)
      await more.click()
      await expect(rows).toHaveCount(45)
      await expect(more).toHaveCount(0)
    })
  } finally {
    await db.execute(sql`delete from products where ref like 'zz-%'`)
    await db.close()
  }
})

test("the selection publishes and unpublishes several products at once", { tag: ["@fr"] }, async ({ page, step }) => {
  const db = openDb()
  await db.execute(sql`delete from products where ref like 'zy-%'`)
  await db.execute(sql`
    insert into products (ref, slug, category_id, title, price_tnd, price_eur, stock, status)
    select 'zy-' || g, 'zy-bulk-' || g, (select id from categories limit 1), '{"fr":"Pièce groupée"}'::jsonb, 1000, 300, 1, 'draft'
    from generate_series(1, 3) g`)
  await db.execute(sql`
    insert into products (ref, slug, category_id, title, price_tnd, price_eur, stock, status)
    select 'zy-4', 'zy-bulk-4', (select id from categories limit 1), '{"fr":"Pièce archivée"}'::jsonb, 1000, 300, 1, 'archived'`)
  try {
    const unpublish = page.getByRole("button", { name: "Dépublier", exact: true })
    await loginAsOwnerAndWait(page)
    await page.goto(`${E2E.dashboardUrl}/products`)
    await page.getByPlaceholder("Référence ou nom").fill("zy-")
    await expect(page.getByRole("checkbox", { name: "Sélectionner zy-1" })).toBeVisible()

    await step("nothing is selected: no bulk buttons", async () => {
      await expect(page.getByRole("button", { name: "Publier la sélection", exact: true })).toHaveCount(0)
      await expect(unpublish).toHaveCount(0)
    })
    await step("two products are selected and published together, the third stays a draft", async () => {
      await page.getByRole("checkbox", { name: "Sélectionner zy-1" }).click()
      await page.getByRole("checkbox", { name: "Sélectionner zy-2" }).click()
      await expect(page.getByText("2 sélectionnés")).toBeVisible()
      await page.getByRole("button", { name: "Publier la sélection", exact: true }).click()
      await expect(unpublish).toHaveCount(2)
      await expect(page.getByText("2 sélectionnés")).toHaveCount(0)
    })
    await step("select all then unpublish puts every product back to draft", async () => {
      await expect(page.getByRole("checkbox", { name: "Sélectionner zy-4" })).toBeDisabled()
      await page.getByRole("checkbox", { name: "Tout sélectionner" }).click()
      await expect(page.getByText("3 sélectionnés")).toBeVisible()
      await page.getByRole("button", { name: "Dépublier la sélection", exact: true }).click()
      await expect(unpublish).toHaveCount(0)
    })
    await step("changing the filter drops the selection", async () => {
      await page.getByRole("checkbox", { name: "Sélectionner zy-1" }).click()
      await page.getByPlaceholder("Référence ou nom").fill("zy-2")
      await expect(page.getByText("sélectionné")).toHaveCount(0)
    })
  } finally {
    await db.execute(sql`delete from products where ref like 'zy-%'`)
    await db.close()
  }
})
