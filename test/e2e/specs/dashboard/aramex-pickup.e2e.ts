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

test("the owner books and cancels a pickup, then cancels the shipment and the cash order is unpaid again", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  await rpc(page.request, "shipping/saveSettings", ARAMEX)
  const { number } = await createOrderViaApi(page.request, { method: "cod", country: "TN" })

  await step("the owner creates the Aramex shipment", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(number)
    await page.getByText(number, { exact: true }).locator("visible=true").first().click()
    await page.getByRole("button", { name: "Créer l'expédition Aramex" }).click()
    await page.getByRole("button", { name: "Créer l'expédition et l'étiquette" }).click()
    await expect(page.getByTestId("shipment-waybill")).toContainText("FAKE")
    expect((await orderRow(number)).status).toBe("fulfilled")
  })

  await step("a pickup is booked at the studio", async () => {
    await page.getByRole("button", { name: "Demander un enlèvement Aramex" }).click()
    await page.getByRole("button", { name: "Demander l'enlèvement" }).click()
    await expect(page.getByTestId("pickup-booked")).toContainText("Enlèvement demandé (n°")
  })

  await step("the pickup is cancelled again", async () => {
    await page.getByRole("button", { name: "Annuler l'enlèvement" }).click()
    await expect(page.getByRole("button", { name: "Demander un enlèvement Aramex" })).toBeVisible()
  })

  await step("cancelling the shipment asks for confirmation and warns about the e-mail", async () => {
    await page.getByRole("button", { name: "Annuler l'expédition" }).click()
    await expect(page.getByText("ne peut pas être annulé")).toBeVisible()
    await page.getByRole("alertdialog").getByRole("button", { name: "Annuler l'expédition" }).click()
    await expect(page.getByTestId("shipment-card")).toContainText("Annulée")
  })

  await step("the cash order is back to awaiting payment, nothing counts as sold", async () => {
    const order = await orderRow(number)
    expect(order.status).toBe("pending_payment")
    expect(order.paidAt).toBeNull()
  })
})
