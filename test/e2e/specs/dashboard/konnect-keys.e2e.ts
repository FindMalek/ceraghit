import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const FAKE_KEY = "demo-konnect-key-1a2b"
const FAKE_WALLET = "demo-wallet-9876"

test("the owner saves Konnect keys, sees them masked after a reload, and removes them", { tag: ["@fr"] }, async ({
  page,
  step,
  shot,
}) => {
  await loginAsOwnerAndWait(page)
  await page.request.delete(`${E2E.apiUrl}/v1/admin/settings/konnect`, { headers: { "x-csrf-token": "orpc" } })
  page.on("dialog", (dialog) => dialog.accept())

  await step("the Konnect block starts empty", async () => {
    await page.goto(`${E2E.dashboardUrl}/payments`)
    await expect(page.getByRole("heading", { name: "Clés Konnect" })).toBeVisible()
    await expect(page.getByText("Non configurées")).toBeVisible()
  })

  await step("saving keeps only the last 4 characters visible", async () => {
    await page.getByLabel("Clé API").fill(FAKE_KEY)
    await page.getByLabel("Identifiant du portefeuille (wallet ID)").fill(FAKE_WALLET)
    await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click()
    await expect(page.getByText("Clés Konnect enregistrées.")).toBeVisible()
    await expect(page.getByText("Enregistrées ici")).toBeVisible()
    await expect(page.getByLabel("Clé API")).toHaveAttribute("placeholder", "•••• 1a2b")
  })

  await step("after a reload the key never comes back to the browser", async () => {
    await page.reload()
    await expect(page.getByText("Enregistrées ici")).toBeVisible()
    await expect(page.getByLabel("Clé API")).toHaveValue("")
    expect(await page.content()).not.toContain(FAKE_KEY)
    await shot("konnect-configured")
  })

  await step("removing the keys brings the empty state back", async () => {
    await page.getByRole("button", { name: "Supprimer les clés" }).click()
    await expect(page.getByText("Non configurées")).toBeVisible()
  })
})
