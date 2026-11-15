import type { Page } from "@playwright/test"
import { E2E } from "../env"

/** Signs the owner in on the dashboard. Labels are French, the dashboard has no other language. */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/login`)
  await page.getByLabel("Email").fill(E2E.adminEmail)
  await page.getByLabel("Mot de passe").fill(E2E.adminPassword)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
}
