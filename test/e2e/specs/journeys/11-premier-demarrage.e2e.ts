import type { Page } from "@playwright/test"
import { eq } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { admins, completeSetup, type Db, openDb, resetSetup, shopProfile } from "../../helpers/db"

const VALID_IBAN = "TN59 1000 6035 1835 9847 8831"
const VALID_RIB = "10 006 035 183 598 478 831"

let db: Db

test.beforeAll(async () => {
  db = openDb()
})

test.afterAll(async () => {
  await completeSetup(db)
  await db.close()
})

const owner = async () => (await db.select().from(admins).where(eq(admins.email, E2E.adminEmail)))[0]
const shop = async () => (await db.select().from(shopProfile))[0]

const next = (page: Page, saved: RegExp) =>
  Promise.all([
    page.waitForResponse((r) => saved.test(r.url()) && r.request().method() === "POST"),
    page.getByRole("button", { name: "Continuer" }).click(),
  ])

test("11 premier démarrage: the name, the studio, the bank details, the optional steps, then the dashboard", async ({
  page,
  journey,
}) => {
  await resetSetup(db)
  await loginAsOwnerAndWait(page)

  await journey.step("À la première connexion, l'assistant vous accueille", async () => {
    await page.goto(`${E2E.dashboardUrl}/products`)
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByRole("heading", { name: "Bienvenue dans votre atelier en ligne" })).toBeVisible()
    await page.getByRole("button", { name: "Commencer" }).click()
  })

  await journey.step("Première question : comment vous appelez-vous ?", async () => {
    await expect(page.getByRole("heading", { name: "Comment vous appelez-vous ?" })).toBeVisible()
    await page.getByLabel("Votre prénom et nom").fill("Sabri")
    await next(page, /profile\/updateOwner/)
    expect((await owner())?.nameConfirmedAt).not.toBeNull()
  })

  await journey.step("Décrivez votre atelier : nom, matricule fiscal, adresse et contacts", async () => {
    await expect(page.getByRole("heading", { name: "Votre atelier" })).toBeVisible()
    await page.getByLabel("Nom affiché").fill("Ceraghit")
    await page.getByLabel("Raison sociale").fill("Ceraghit Creation")
    await page.getByLabel("Matricule fiscal").fill("1234567/A/M/000")
    await page.getByLabel("Adresse").fill("1 rue de l'Atelier")
    await page.getByLabel("Ville").fill("Tunis")
    await page.getByLabel("Email de contact").fill("shop@e2e.local")
    await page.getByLabel("Email des notifications").fill("notify@e2e.local")
    await page
      .getByLabel(/Téléphone|Numéro/)
      .first()
      .fill("20 000 000")
    await next(page, /profile\/update/)
    expect((await shop())?.legalName).toBe("Ceraghit Creation")
  })

  await journey.step("Indiquez où recevoir les virements : un IBAN faux est refusé", async () => {
    await expect(page.getByRole("heading", { name: "Où recevoir les virements ?" })).toBeVisible()
    await page.getByLabel("Titulaire du compte").fill("Ceraghit Creation")
    await page.getByLabel("Banque", { exact: true }).fill("Banque e2e")
    await page.getByLabel("RIB").fill(VALID_RIB)
    await page.getByLabel("IBAN").fill("TN59 1000 6035 1835 9847 8832")
    await page.getByRole("button", { name: "Continuer" }).click()
    await expect(page.getByText(/L'IBAN n'est pas valide/)).toBeVisible()
  })

  await journey.step("Avec le bon IBAN, les coordonnées bancaires sont enregistrées", async () => {
    await page.getByLabel("IBAN").fill(VALID_IBAN)
    await next(page, /profile\/update/)
    expect((await shop())?.bankIban).toBe(VALID_IBAN.replaceAll(" ", ""))
    await expect(page.getByRole("heading", { name: "Frais de livraison" })).toBeVisible()
  })

  await journey.step("Confirmez les frais de livraison", async () => {
    await page.getByRole("button", { name: "Les tarifs me conviennent" }).click()
    await expect(page.getByRole("heading", { name: "Pour aller plus loin" })).toBeVisible()
    expect((await shop())?.shippingConfirmedAt).not.toBeNull()
  })

  await journey.step("Les étapes facultatives peuvent attendre : Plus tard", async () => {
    const later = page.getByRole("button", { name: "Plus tard" })
    while ((await later.count()) > 0) {
      const left = await later.count()
      await later.first().click()
      await expect(later).toHaveCount(left - 1)
    }
    expect((await shop())?.skippedSteps.length).toBeGreaterThan(0)
    await page.getByRole("button", { name: "Continuer" }).click()
    await expect(page.getByRole("heading", { name: "Tout est prêt" })).toBeVisible()
  })

  await journey.step("Ouvrez votre tableau de bord : plus rien ne vous renvoie à l'assistant", async () => {
    await page.getByRole("button", { name: "Ouvrir mon tableau de bord" }).click()
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible()
    expect((await shop())?.onboardedAt).not.toBeNull()
    await page.goto(`${E2E.dashboardUrl}/products`)
    await expect(page).toHaveURL(/\/products$/)
  })
})
