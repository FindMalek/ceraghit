import type { APIRequestContext } from "@playwright/test"
import { E2E } from "../../env"
import { createOrderViaApi, expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { orderRow } from "../../support/db"

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

const ARAMEX = {
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
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", { mode: { provider: "manual", quoteFromProvider: false } })
  await page.close()
})

test("the owner ships an order to France with a customs declaration and gets the private commercial invoice", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", ARAMEX)
  const { number } = await createOrderViaApi(page.request, { method: "transfer", country: "FR" })

  await step("the transfer order is marked paid by hand", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(number)
    await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    await page.getByRole("button", { name: "Marquer payée" }).click()
    await page.getByRole("button", { name: "Confirmer le paiement" }).click()
    await expect.poll(async () => (await orderRow(number)).status).toBe("paid")
  })

  await step("the shipment button is open for a destination outside Tunisia", async () => {
    await page.reload()
    await page.getByPlaceholder("Numéro, nom ou email").fill(number)
    await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    await expect(page.getByRole("button", { name: "Créer l'expédition Aramex" })).toBeEnabled()
    await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
  })

  await step("the customs declaration is prefilled in euros, goods only", async () => {
    const customs = page.getByTestId("shipment-customs")
    await expect(customs).toContainText("sans la livraison")
    await expect(customs.getByLabel("Valeur (EUR)")).not.toHaveValue("")
    await expect(customs.getByLabel("Code SH")).toHaveValue("691390")
    await expect(page.getByTestId("shipment-customs-total")).toContainText("€")
  })

  await step("the postcode field says what France expects and refuses a wrong one", async () => {
    await expect(page.getByText("Obligatoire, exemple : 75001")).toBeVisible()
    await page.getByLabel("Code postal").fill("7500")
    await expect(page.getByText("Code postal invalide pour France (exemple : 75001).").first()).toBeVisible()
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    // the hint under the field and the message the server refused with
    await expect(page.getByText("Code postal invalide pour France (exemple : 75001).")).toHaveCount(2)
    await expect(page.getByText("Une erreur est survenue")).toHaveCount(0)
    await page.getByLabel("Code postal").fill("75001")
  })

  await step("a piece without a customs code cannot be sent", async () => {
    await page.getByTestId("shipment-customs").getByLabel("Code SH").fill("12")
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByText("Ajoutez le code douanier (SH) de chaque pièce.")).toBeVisible()
  })

  await step("with a valid code the shipment is created with its label and commercial invoice", async () => {
    await page.getByTestId("shipment-customs").getByLabel("Code SH").fill("6913.90")
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
    await expect(page.getByRole("button", { name: "Facture commerciale (PDF)" })).toBeVisible()
    await page.getByTestId("shipment-card").scrollIntoViewIfNeeded()
  })

  await step("the invoice opens through a signed link and /files never serves it", async () => {
    await page.evaluate(() => {
      const opened: string[] = []
      ;(window as unknown as { opened: string[] }).opened = opened
      window.open = (url) => {
        opened.push(String(url))
        return null
      }
    })
    await page.getByRole("button", { name: "Facture commerciale (PDF)" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened.length)).toBe(1)
    const link = new URL(await page.evaluate(() => (window as unknown as { opened: string[] }).opened[0]!))
    expect(link.searchParams.get("X-Amz-Signature")).toBeTruthy()
    const pdf = await page.request.get(link.toString())
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF")
    const key = link.pathname.split("/").slice(2).join("/")
    expect(key).toMatch(/^(.+\/)?private\/invoices\/.+\.pdf$/)
    expect((await page.request.get(`${E2E.apiUrl}/files/${key}`, { maxRedirects: 0 })).status()).toBe(404)
  })
})
