import type { APIRequestContext, Page } from "@playwright/test"
import { E2E } from "../../env"
import { createOrderViaApi, expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { setShipmentWaybill } from "../../support/db"

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

async function openOrder(page: Page, number: string): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/orders`)
  await page.getByPlaceholder("Numéro, nom ou email").fill(number)
  await page.getByText(number, { exact: true }).locator("visible=true").first().click()
}

async function shipOrder(page: Page, number: string): Promise<void> {
  await openOrder(page, number)
  await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
  await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
  await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
}

test("the owner finds parcels on their way or in trouble from the orders list and the overview", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", ARAMEX)
  const moving = await createOrderViaApi(page.request, { method: "cod", country: "TN" })
  const stuck = await createOrderViaApi(page.request, { method: "cod", country: "TN" })

  await step("two orders get an Aramex parcel, one then reports an incident", async () => {
    await shipOrder(page, moving.number)
    await shipOrder(page, stuck.number)
    await setShipmentWaybill(stuck.number, `FAKE-PROBLEM-${Date.now()}`)
    await openOrder(page, stuck.number)
    await page.getByRole("button", { name: "Actualiser" }).click()
    await expect(page.getByTestId("shipment-card")).toContainText("Incident de livraison")
  })

  await step("the list shows the parcel badge next to each order", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(stuck.number)
    await expect(page.getByText("Incident de livraison").locator("visible=true").first()).toBeVisible()
    await page.getByPlaceholder("Numéro, nom ou email").fill(moving.number)
    await expect(page.getByText("Étiquette créée").locator("visible=true").first()).toBeVisible()
  })

  await step("the shipping filter keeps only parcels on their way, then only the incident", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders?shipment=open`)
    await expect(page.getByText(moving.number, { exact: true }).locator("visible=true").first()).toBeVisible()
    await expect(page.getByText(stuck.number, { exact: true })).toHaveCount(0)
    await page.getByRole("combobox", { name: "Filtrer par expédition" }).click()
    await page.getByRole("option", { name: "Expédition : problème" }).click()
    await expect(page.getByText(stuck.number, { exact: true }).locator("visible=true").first()).toBeVisible()
    await expect(page.getByText(moving.number, { exact: true })).toHaveCount(0)
  })

  await step("the overview counts parcels on their way and links to the filtered list", async () => {
    await page.goto(E2E.dashboardUrl)
    await expect(page.getByRole("link", { name: /Colis en cours/ })).toBeVisible()
    await page.getByRole("link", { name: /Colis en cours/ }).click()
    await expect(page).toHaveURL(/shipment=open/)
    await expect(page.getByText(moving.number, { exact: true }).locator("visible=true").first()).toBeVisible()
  })
})
