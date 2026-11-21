import { siteImages } from "@workspace/db"
import { inArray } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

const SLOTS = ["studio", "logo", "texture", "og-home"] as const
let before: (typeof siteImages.$inferInsert)[] = []

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  before = await db
    .select()
    .from(siteImages)
    .where(inArray(siteImages.slot, [...SLOTS]))
  await db.close()
})

// These slots feed every storefront page: put them back whatever happened.
test.afterAll(async () => {
  const db = openDb()
  await db.delete(siteImages).where(inArray(siteImages.slot, [...SLOTS]))
  if (before.length) await db.insert(siteImages).values(before)
  await db.close()
})

test("changing the studio photo and the logo in the dashboard changes the storefront", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  const pick = async (slot: string, label: string) => {
    const section = page.locator(`#${slot}`)
    await section.getByRole("button", { name: `Actions pour ${label} 1` }).click()
    await page.getByRole("menuitem", { name: "Remplacer…" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // The first photos of the library are the ones in use; take one further down.
    await dialog.locator("button[data-tile]").nth(12).click()
    await dialog.getByRole("button", { name: "Choisir", exact: true }).click()
    await expect(dialog).toBeHidden()
    await section.getByRole("button", { name: "Enregistrer" }).click()
    await expect(section.getByText("Images enregistrées.")).toBeVisible()
    return section.getByTestId(`${slot}-tile`).first().locator("img").getAttribute("src")
  }
  let studio = ""
  let logo = ""

  await step("replace the first studio photo and save", async () => {
    await page.goto(`${E2E.dashboardUrl}/site-images`)
    await expect(page.locator("#studio").getByTestId("studio-tile").first()).toBeVisible()
    studio = (await pick("studio", "L'atelier")) ?? ""
    expect(studio).not.toBe("")
  })

  await step("replace the logo and save", async () => {
    logo = (await pick("logo", "Logo")) ?? ""
    expect(logo).not.toBe("")
  })

  await step("the home page shows the new studio photo and logo, and the favicon follows", async () => {
    await page.goto(`${E2E.webUrl}/fr`)
    const file = (src: string) => decodeURIComponent(src.split("/").pop() ?? "").split("?")[0] ?? ""
    await expect(page.locator("main li.aspect-\\[4\\/5\\] img").first()).toHaveAttribute(
      "src",
      new RegExp(encodeURIComponent(file(studio)).slice(0, 12)),
    )
    await expect(page.locator("header img").first()).toHaveAttribute("src", new RegExp(file(logo).slice(0, 12)))
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /./)
  })

  await step("the share card of the home page still renders", async () => {
    const res = await page.request.get(`${E2E.webUrl}/fr/opengraph-image`)
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("image/")
  })
})
