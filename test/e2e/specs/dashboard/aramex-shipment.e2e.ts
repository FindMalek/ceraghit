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

test("the owner creates an Aramex shipment on a cash on delivery order and downloads its private label", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", ARAMEX)
  const { number } = await createOrderViaApi(page.request, { method: "cod", country: "TN" })

  await step("the order offers the Aramex shipment as its main action", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(number)
    await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
  })

  await step("the dialog is prefilled, says it is simulated and what Aramex will collect", async () => {
    await expect(page.getByTestId("shipment-environment")).toHaveText("Simulé")
    await expect(page.getByTestId("shipment-cod")).toContainText("Aramex encaissera")
    await expect(page.getByLabel("Ville")).not.toHaveValue("")
    await expect(page.getByLabel("Poids (g)")).not.toHaveValue("")
  })

  await step("a mistyped street is checked with Aramex and the suggestion fills the form", async () => {
    await page.getByLabel("Adresse", { exact: true }).fill("12 rue Habib Bourgiba")
    await page.getByRole("button", { name: "Vérifier l'adresse avec Aramex" }).click()
    await expect(page.getByTestId("address-check")).toContainText("Aramex propose une autre adresse")
    await page.getByRole("button", { name: "Utiliser cette suggestion" }).click()
    await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue("Avenue Habib Bourguiba")
    await expect(page.getByLabel("Code postal")).toHaveValue("1000")
  })

  await step("confirming creates the shipment, ships the order and counts the cash sale", async () => {
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
    await page.getByTestId("shipment-card").scrollIntoViewIfNeeded()
    const order = await orderRow(number)
    expect(order.status).toBe("fulfilled")
    expect(order.paidAt).not.toBeNull()
  })

  await step("the label opens through a signed link and /files never serves it", async () => {
    await page.evaluate(() => {
      const opened: string[] = []
      ;(window as unknown as { opened: string[] }).opened = opened
      window.open = (url) => {
        opened.push(String(url))
        return null
      }
    })
    await page.getByRole("button", { name: "Télécharger l'étiquette (PDF)" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened.length)).toBe(1)
    const link = new URL(await page.evaluate(() => (window as unknown as { opened: string[] }).opened[0]!))
    expect(link.searchParams.get("X-Amz-Signature")).toBeTruthy()
    const pdf = await page.request.get(link.toString())
    expect(pdf.ok()).toBe(true)
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF")
    const key = link.pathname.split("/").slice(2).join("/")
    expect(key).toMatch(/^(.+\/)?private\/labels\/.+\.pdf$/)
    const direct = await page.request.get(`${E2E.apiUrl}/files/${key}`, { maxRedirects: 0 })
    expect(direct.status()).toBe(404)
  })
})
