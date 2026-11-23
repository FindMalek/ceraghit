import type { Locator, Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { salesWindow } from "../../support/db"

type Currency = "TND" | "EUR"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const tileValue = (page: Page, label: string): Locator =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('[data-slot="card-title"]')

const minorOf = (text: string, currency: Currency): number =>
  Math.round(Number(text.replace(/[^\d,]/g, "").replace(",", ".")) * (currency === "TND" ? 1000 : 100))

async function read(page: Page, label: string, currency: Currency): Promise<number> {
  return minorOf((await tileValue(page, label).innerText()).trim(), currency)
}

test("09 statistiques: the figures per currency, another period, then the orders behind them", async ({
  page,
  journey,
}) => {
  await loginAsOwnerAndWait(page)

  await journey.step("L'aperçu montre les ventes en dinars et en euros, séparément", async () => {
    await page.goto(`${E2E.dashboardUrl}/`)
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible()
    await expect(tileValue(page, "Ventes en dinars")).toBeVisible()
    await expect(tileValue(page, "Ventes en euros")).toBeVisible()
    const figures = await page.locator('[data-slot="card-title"]').allInnerTexts()
    for (const figure of figures) expect(figure).not.toMatch(/DT[\s\S]*€|€[\s\S]*DT/)
  })

  await journey.step("Sur 30 jours, chaque total est la somme des commandes payées dans sa monnaie", async () => {
    await expect(page.getByRole("combobox", { name: "Période" })).toBeVisible()
    for (const [currency, label] of [
      ["TND", "Ventes en dinars"],
      ["EUR", "Ventes en euros"],
    ] as const) {
      const window = await salesWindow(currency, 30)
      expect(await read(page, label, currency)).toBe(window.total)
    }
  })

  await journey.step("Changez la période : 7 derniers jours", async () => {
    await page.getByRole("combobox", { name: "Période" }).click()
    await page.getByRole("option", { name: "7 derniers jours" }).click()
    await expect(page.getByRole("combobox", { name: "Période" })).toContainText("7 derniers jours")
    await expect.poll(() => read(page, "Ventes en dinars", "TND")).toBe((await salesWindow("TND", 7)).total)
    expect(await read(page, "Ventes en euros", "EUR")).toBe((await salesWindow("EUR", 7)).total)
  })

  await journey.step("Les graphiques et les classements suivent la même période", async () => {
    await expect(page.getByText("Ventes par jour, dinars", { exact: true })).toBeVisible()
    await expect(page.getByText("Ventes par jour, euros", { exact: true })).toBeVisible()
  })

  await journey.step("Ouvrez Commandes pour voir ce qu'il y a derrière les chiffres", async () => {
    await page
      .getByRole("link", { name: /Commandes/ })
      .locator("visible=true")
      .first()
      .click()
    await expect(page).toHaveURL(`${E2E.dashboardUrl}/orders`)
    await expect(page.getByRole("combobox", { name: "Filtrer par statut" })).toBeVisible()
  })

  await journey.step("Filtrez sur les commandes payées", async () => {
    await page.getByRole("combobox", { name: "Filtrer par statut" }).click()
    await page.getByRole("option", { name: "Payée", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Filtrer par statut" })).toContainText("Payée")
  })
})
