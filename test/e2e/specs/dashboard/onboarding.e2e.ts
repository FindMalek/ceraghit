import { execFileSync } from "node:child_process"
import type { Page } from "@playwright/test"
import { eq } from "drizzle-orm"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { admins, completeSetup, type Db, openDb, resetSetup, shopProfile } from "../../helpers/db"

const OWNER = "Sabri"
const VALID_IBAN = "TN59 1000 6035 1835 9847 8831"
const VALID_RIB = "10 006 035183598478831"
const NO_OVERFLOW = () => document.documentElement.scrollWidth <= window.innerWidth

let db: Db

test.describe.configure({ mode: "serial" })

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

test.beforeEach(async ({ page }) => {
  await resetSetup(db)
  await loginAsOwnerAndWait(page)
})

test("a fresh install lands on the wizard and asks the owner name first", async ({ page, step }) => {
  await step("any dashboard page redirects to the wizard", async () => {
    await page.goto(`${E2E.dashboardUrl}/products`)
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByRole("heading", { name: "Bienvenue dans votre atelier en ligne" })).toBeVisible()
  })
  await step("the name question", async () => {
    await page.getByRole("button", { name: "Commencer" }).click()
    await expect(page.getByRole("heading", { name: "Comment vous appelez-vous ?" })).toBeVisible()
  })
  await step("an empty name is refused", async () => {
    await page.getByLabel("Votre prénom et nom").fill("")
    await page.getByRole("button", { name: "Continuer" }).click()
    await expect(page.getByText("Entrez votre nom (2 à 80 caractères).")).toBeVisible()
    expect((await owner())?.nameConfirmedAt).toBeNull()
  })
  await step("the name is saved", async () => {
    await page.getByLabel("Votre prénom et nom").fill(OWNER)
    await next(page, /profile\/updateOwner/)
    await expect(page.getByRole("heading", { name: "Votre atelier" })).toBeVisible()
    const row = await owner()
    expect(row?.name).toBe(OWNER)
    expect(row?.nameConfirmedAt).not.toBeNull()
  })
  expect(await page.evaluate(NO_OVERFLOW)).toBe(true)
})

test("the wizard saves each step, validates the IBAN and resumes after a reload", async ({ page, step }) => {
  await page.goto(`${E2E.dashboardUrl}/onboarding?step=owner`)
  await page.getByLabel("Votre prénom et nom").fill(OWNER)
  await next(page, /profile\/updateOwner/)

  await step("shop profile", async () => {
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
    await expect(page.getByRole("heading", { name: "Où recevoir les virements ?" })).toBeVisible()
    const row = await shop()
    expect(row?.legalName).toBe("Ceraghit Creation")
    expect(row?.taxId).toBe("1234567/A/M/000")
    expect(row?.notifyEmail).toBe("notify@e2e.local")
  })

  await step("an invalid IBAN is rejected and nothing is saved", async () => {
    await page.getByLabel("Titulaire du compte").fill("Ceraghit Creation")
    await page.getByLabel("Banque", { exact: true }).fill("Banque e2e")
    await page.getByLabel("RIB").fill(VALID_RIB)
    await page.getByLabel("IBAN").fill("TN59 1000 6035 1835 9847 8832")
    await page.getByRole("button", { name: "Continuer" }).click()
    await expect(page.getByText(/L'IBAN n'est pas valide/)).toBeVisible()
    expect((await shop())?.bankIban ?? null).toBeNull()
  })

  await step("a valid IBAN is saved", async () => {
    await page.getByLabel("IBAN").fill(VALID_IBAN)
    await next(page, /profile\/update/)
    await expect(page.getByRole("heading", { name: "Frais de livraison" })).toBeVisible()
    const row = await shop()
    expect(row?.bankIban).toBe(VALID_IBAN.replaceAll(" ", ""))
    expect(row?.bankHolder).toBe("Ceraghit Creation")
  })

  await step("reload mid-wizard resumes at the same step", async () => {
    await page.reload()
    await expect(page.getByRole("heading", { name: "Frais de livraison" })).toBeVisible()
    await page.getByRole("button", { name: "Retour" }).click()
    await expect(page.getByLabel("IBAN")).toHaveValue(/TN59/)
  })

  await step("shipping confirmation", async () => {
    await page.goto(`${E2E.dashboardUrl}/onboarding?step=shipping`)
    await page.getByRole("button", { name: "Les tarifs me conviennent" }).click()
    await expect(page.getByRole("heading", { name: "Pour aller plus loin" })).toBeVisible()
    expect((await shop())?.shippingConfirmedAt).not.toBeNull()
  })

  await step("optional steps can be skipped", async () => {
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

  await step("finish opens the dashboard and the gate is gone", async () => {
    await page.getByRole("button", { name: "Ouvrir mon tableau de bord" }).click()
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible()
    expect((await shop())?.onboardedAt).not.toBeNull()
    await page.goto(`${E2E.dashboardUrl}/products`)
    await expect(page).toHaveURL(/\/products$/)
  })
  expect(await page.evaluate(NO_OVERFLOW)).toBe(true)
})

test("a required step cannot be skipped", async ({ page, step }) => {
  await step("finishing is disabled while required steps are missing", async () => {
    await page.goto(`${E2E.dashboardUrl}/onboarding?step=done`)
    await expect(page.getByRole("button", { name: "Ouvrir mon tableau de bord" })).toBeDisabled()
    await expect(page.getByText("Il reste à compléter :")).toBeVisible()
  })
})

test("re-running the seed keeps the owner name and the shop profile", async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${E2E.dashboardUrl}/onboarding?step=owner`)
  await page.getByLabel("Votre prénom et nom").fill(OWNER)
  await next(page, /profile\/updateOwner/)
  await completeSetup(db)
  const before = await shop()
  expect(before?.onboardedAt).not.toBeNull()
  execFileSync("bun", ["src/seed-cli.ts"], {
    cwd: `${E2E.repoRoot}packages/db`,
    env: {
      ...process.env,
      DATABASE_URL: E2E.databaseUrl,
      ADMIN_EMAIL: E2E.adminEmail,
      ADMIN_PASSWORD: E2E.adminPassword,
    },
    stdio: "pipe",
  })
  expect((await owner())?.name).toBe(OWNER)
  expect((await owner())?.nameConfirmedAt).not.toBeNull()
  expect(await shop()).toEqual(before)
  await page.context().clearCookies()
  await loginAsOwnerAndWait(page)
})
