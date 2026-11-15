import type { Page } from "@playwright/test"
import { E2E } from "../env"

/** Signs the owner in on the dashboard. Labels are French, the dashboard has no other language. */
export async function loginAsOwner(page: Page, password: string = E2E.adminPassword, email: string = E2E.adminEmail) {
  await page.goto(`${E2E.dashboardUrl}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
}

export async function loginAsOwnerAndWait(page: Page): Promise<void> {
  await loginAsOwner(page)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
}
