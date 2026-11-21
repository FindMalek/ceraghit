import type { APIRequestContext } from "@playwright/test"
import { E2E } from "../../env"
import { createOrderViaApi, expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { markCitiesAsDemo } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

async function rpc(request: APIRequestContext, path: string, json: unknown): Promise<void> {
  const res = await request.post(`${E2E.dashboardUrl}/api/rpc/admin/${path}`, {
    headers: { "x-csrf-token": "orpc" },
    data: { json },
  })
  expect(res.ok(), `${path} ${await res.text()}`).toBe(true)
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", { mode: { provider: "manual", quoteFromProvider: false } })
  await page.close()
  await markCitiesAsDemo()
})

test("the owner refreshes the city list and checks an order address with Aramex", { tag: ["@fr"] }, async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", {
    mode: { provider: "aramex", quoteFromProvider: false },
    aramex: {
      config: {
        mode: "test",
        userName: "shop@example.test",
        accountNumber: "20016",
        accountEntity: "TUN",
        accountCountryCode: "TN",
      },
      secrets: { password: "fake-password", accountPin: "fake-pin-1234" },
    },
  })

  await step("the shipping page refreshes the Tunisian list from Aramex", async () => {
    await page.goto(`${E2E.dashboardUrl}/shipping`)
    await page.getByRole("button", { name: "Mettre à jour la liste des villes" }).click()
    await expect(page.getByTestId("cities-count")).toContainText("12 villes")
  })

  await step("an order address is checked and recognised", async () => {
    const { number } = await createOrderViaApi(page.request, { method: "cod", country: "TN" })
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(number)
    await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    await page.getByRole("button", { name: "Vérifier l'adresse avec Aramex" }).click()
    await expect(page.getByTestId("address-check")).toContainText("Adresse reconnue")
  })
})
