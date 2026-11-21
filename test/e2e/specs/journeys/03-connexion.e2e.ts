import { E2E } from "../../env"
import { expect, loginAsOwner, test } from "../../fixtures"
import { adminSessions, completeSetup, openDb, rateLimits } from "../../helpers/db"

test("03 connexion: wrong password, then the right one, then sign out", async ({ page, journey, isMobile }) => {
  const db = openDb()
  await completeSetup(db)
  await db.delete(rateLimits)
  const sessions = async () => (await db.select().from(adminSessions)).length
  const before = await sessions()

  await journey.step("Ouvrez la page de connexion du tableau de bord", async () => {
    await page.goto(`${E2E.dashboardUrl}/login`)
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Mot de passe")).toBeVisible()
  })

  await journey.step("Un mauvais mot de passe affiche un message clair", async () => {
    await loginAsOwner(page, "pas-le-bon-mot-de-passe")
    await expect(page.getByText(/Email ou mot de passe incorrect/)).toBeVisible()
    expect(await sessions()).toBe(before)
  })

  await journey.step("Saisissez votre email et votre mot de passe, puis connectez-vous", async () => {
    await loginAsOwner(page)
    await expect(page).toHaveURL(`${E2E.dashboardUrl}/`)
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible()
    expect(await sessions()).toBe(before + 1)
  })

  await journey.step("Pour quitter, cliquez sur Se déconnecter", async () => {
    if (isMobile) await page.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("button", { name: E2E.adminEmail }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessions()).toBe(before)
  })
  await db.close()
})
