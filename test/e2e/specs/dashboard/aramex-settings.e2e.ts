import type { APIRequestContext } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { clearAramexCredentials } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

async function reset(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${E2E.dashboardUrl}/api/rpc/admin/shipping/saveSettings`, {
    headers: { "x-csrf-token": "orpc" },
    data: { json: { mode: { provider: "manual", quoteFromProvider: false } } },
  })
  expect(res.ok(), await res.text()).toBe(true)
}

async function settingsText(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${E2E.dashboardUrl}/api/rpc/admin/shipping/getSettings`, {
    headers: { "x-csrf-token": "orpc" },
    data: { json: {} },
  })
  expect(res.ok()).toBe(true)
  return res.text()
}

const SECRET = "fake-password-9131"

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await loginAsOwnerAndWait(page)
  await reset(page.request)
  await page.close()
})

test("the owner enters the Aramex credentials, tests them before saving and never sees the secrets again", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await reset(page.request)
  await clearAramexCredentials()
  await page.goto(`${E2E.dashboardUrl}/shipping`)

  await step("choosing Aramex shows each field with what to ask the Aramex rep", async () => {
    await page.getByRole("radio", { name: /Aramex/ }).click()
    await expect(page.getByText("Demandez « AccountEntity » à votre commercial.")).toBeVisible()
    await expect(page.getByText("un accès API Shipping Services (ShippingAPI.V2)")).toBeVisible()
  })

  await step("the credentials and the shipper address are filled in", async () => {
    await page.getByLabel("Nom d'utilisateur").fill("shop@example.test")
    await page.getByLabel("Mot de passe").fill("fake-bad-login")
    await page.getByLabel("Numéro de compte").fill("20016")
    await page.getByLabel("PIN du compte").fill("fake-pin-1234")
    await page.getByLabel("Entité du compte").fill("TUN")
    await page.getByLabel("Société").fill("Ceraghit Creation")
    await page.getByLabel("Nom du contact").fill("Sabri Ghit")
    await page.getByLabel("Téléphone").fill("+21620000000")
    await page.getByLabel("E-mail").fill("atelier@example.test")
    await page.getByLabel("Adresse", { exact: true }).fill("1 rue de l'atelier")
    await page.getByLabel("Ville", { exact: true }).fill("Tunis")
  })

  await step("a wrong password fails at the login step with a clear message", async () => {
    await page.getByRole("button", { name: "Tester la connexion" }).click()
    const login = page.locator('[data-step="login"]')
    await expect(login).toHaveAttribute("data-ok", "false")
    await expect(login).toContainText("Identifiants refusés")
  })

  await step("the right password passes the login and the rate step, nothing saved yet", async () => {
    await page.getByLabel("Mot de passe").fill(SECRET)
    await page.getByRole("button", { name: "Tester la connexion" }).click()
    await expect(page.locator('[data-step="login"]')).toHaveAttribute("data-ok", "true")
    await expect(page.locator('[data-step="rate"]')).toHaveAttribute("data-ok", "true")
    const stored = await settingsText(page.request)
    expect(stored).not.toContain(SECRET)
  })

  await step("saving keeps the secrets write-only: the page only says Configurée", async () => {
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Réglages de livraison enregistrés.")).toBeVisible()
    await page.reload()
    await expect(page.getByText("Configurée").first()).toBeVisible()
    expect(await page.content()).not.toContain(SECRET)
    const view = await settingsText(page.request)
    expect(view).not.toContain(SECRET)
  })
})
