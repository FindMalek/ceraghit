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

test("the owner follows a parcel on the order and the customer sees it on the order page", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", ARAMEX)
  const { number, token } = await createOrderViaApi(page.request, { method: "cod", country: "TN" })

  await step("the owner creates the Aramex shipment", async () => {
    await openOrder(page, number)
    await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
  })

  await step("Actualiser fills the timeline and moves the parcel in transit", async () => {
    await page.getByRole("button", { name: "Actualiser" }).click()
    await expect(page.getByTestId("shipment-event").first()).toContainText("In transit")
    await expect(page.getByTestId("shipment-event")).toHaveCount(3)
    await expect(page.getByTestId("shipment-card")).toContainText("En transit")
    await expect(page.getByTestId("shipment-polled")).toContainText("Dernière mise à jour")
  })

  await step("the customer reads the status in French, English and Arabic", async () => {
    const orderUrl = (locale: string) => `${E2E.webUrl}/${locale}/order/${number}?t=${token}`
    await page.goto(orderUrl("fr"))
    await expect(page.getByTestId("parcel-status")).toHaveText("En cours d'acheminement")
    await page.goto(orderUrl("en"))
    await expect(page.getByTestId("parcel-status")).toHaveText("On its way to you")
    await page.goto(orderUrl("ar"))
    await expect(page.getByTestId("parcel-status")).toHaveText("في الطريق إليك")
  })

  await step("a delivered parcel closes the shipment, no refresh is offered", async () => {
    await setShipmentWaybill(number, `FAKE-DELIVERED-${Date.now()}`)
    await openOrder(page, number)
    await page.getByRole("button", { name: "Actualiser" }).click()
    await expect(page.getByTestId("shipment-card")).toContainText("Livrée")
    await expect(page.getByTestId("shipment-card")).toContainText("Livrée le")
    await expect(page.getByRole("button", { name: "Actualiser" })).toHaveCount(0)
    await page.goto(`${E2E.webUrl}/fr/order/${number}?t=${token}`)
    await expect(page.getByTestId("parcel-status")).toContainText("Livré le")
  })

  await step("a parcel with an incident shows the delay to the customer", async () => {
    const other = await createOrderViaApi(page.request, { method: "cod", country: "TN" })
    await openOrder(page, other.number)
    await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
    await setShipmentWaybill(other.number, `FAKE-PROBLEM-${Date.now()}`)
    await openOrder(page, other.number)
    await page.getByRole("button", { name: "Actualiser" }).click()
    await expect(page.getByTestId("shipment-card")).toContainText("Incident de livraison")
    await page.goto(`${E2E.webUrl}/fr/order/${other.number}?t=${other.token}`)
    await expect(page.getByTestId("parcel-status")).toHaveText("Retard, nous suivons le colis")
  })
})
