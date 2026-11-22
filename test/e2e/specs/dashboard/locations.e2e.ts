import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { localePath } from "../../helpers/locale"
import { fillLocalized } from "../../helpers/products"
import { deleteLocations, locationRows } from "../../support/locations"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

test.afterEach(async () => {
  await deleteLocations("Atelier test")
})

const PHONE = "+216 71 000 111"
const HOURS = { fr: "Mardi au samedi", en: "Tuesday to Saturday", ar: "من الثلاثاء إلى السبت" }
const MAP = "https://maps.example.test/atelier"

test("the owner adds a workshop in three languages, edits it, and deletes it", { tag: ["@fr"] }, async ({
  page,
  step,
  shot,
}) => {
  const name = `Atelier test ${Date.now().toString(36)}`
  await loginAsOwnerAndWait(page)

  await step("an empty form is refused and nothing is saved", async () => {
    await page.goto(`${E2E.dashboardUrl}/locations`)
    await page.getByRole("button", { name: "Nouvel atelier" }).click()
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible()
    expect(await locationRows("Atelier test")).toHaveLength(0)
  })

  await step("fill address, phone, hours and description in fr, en and ar, then save", async () => {
    await page.getByLabel("Nom *").fill(name)
    await page.getByLabel("Adresse *").fill("12 rue du Four")
    await page.getByLabel("Ville *").fill("Nabeul")
    await page.getByLabel("Pays *").fill("Tunisie")
    await page.getByLabel("Téléphone").fill(PHONE)
    await fillLocalized(page, "loc-hours", HOURS)
    await fillLocalized(page, "loc-desc", {
      fr: "Notre atelier de tournage",
      en: "Our throwing studio",
      ar: "ورشة التشكيل لدينا",
    })
    await page.getByLabel("Lien de la carte").fill(MAP)
    await shot("location-form")
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText(name)).toBeVisible()
    const [row] = await locationRows(name)
    expect(row).toMatchObject({ name, city: "Nabeul", phone: PHONE, visible: true })
    expect(row?.hours).toEqual(HOURS)
  })

  await step("the storefront lists it in each language with the phone isolated and a map link", async () => {
    for (const locale of ["fr", "en", "ar"] as const) {
      await page.goto(`${E2E.webUrl}${localePath(locale, "/atelier")}`)
      const card = page.getByRole("listitem").filter({ hasText: name })
      await expect(card).toContainText(HOURS[locale])
      await expect(card.locator("bdi", { hasText: PHONE })).toBeVisible()
      await expect(card.locator(`a[href="${MAP}"]`)).toBeVisible()
    }
    await shot("location-on-atelier")
  })

  await step("editing the city shows on the storefront", async () => {
    await page.goto(`${E2E.dashboardUrl}/locations`)
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Modifier" }).click()
    await page.getByLabel("Ville *").fill("Hammamet")
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Hammamet")
    await page.goto(`${E2E.webUrl}/atelier`)
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Hammamet")
  })

  await step("deleting it removes it from the dashboard and the storefront", async () => {
    await page.goto(`${E2E.dashboardUrl}/locations`)
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Supprimer" }).click()
    await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
    await expect(page.getByText(name)).toHaveCount(0)
    expect(await locationRows(name)).toHaveLength(0)
    await page.goto(`${E2E.webUrl}/atelier`)
    await expect(page.getByText(name)).toHaveCount(0)
  })
})
