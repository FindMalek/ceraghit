import type { APIRequestContext } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { fillCheckout, openCheckout } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { setStock } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

async function saveShipping(request: APIRequestContext, quoteFromProvider: boolean): Promise<void> {
  const res = await request.post(`${E2E.dashboardUrl}/api/rpc/admin/shipping/saveSettings`, {
    headers: { "x-csrf-token": "orpc" },
    data: {
      json: {
        mode: { provider: quoteFromProvider ? "aramex" : "manual", quoteFromProvider },
        ...(quoteFromProvider
          ? {
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
          : {}),
      },
    },
  })
  expect(res.ok(), await res.text()).toBe(true)
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await loginAsOwnerAndWait(page)
  await saveShipping(page.request, false)
  await page.close()
})

test("the checkout shows the simulated Aramex delivery price and falls back to the flat rate when it is off", {
  tag: ["@fr"],
}, async ({ page, step }) => {
  // The cheapest plain piece, so the cart stays under the free delivery threshold.
  const list = (await (await page.request.get(`${E2E.apiUrl}/v1/products`)).json()) as {
    id: string
    slug: string
    unique: boolean
    quoteOnly: boolean
    variants: unknown[]
    prices: { TND: number }
  }[]
  const piece = list
    .filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0 && p.prices.TND > 0)
    .sort((a, b) => a.prices.TND - b.prices.TND)[0]
  if (!piece) throw new Error("no plain piece in the demo seed")
  await setStock(piece.id, 50)
  const quote = async () => {
    const res = await page.request.post(`${E2E.apiUrl}/v1/shipping-quote`, {
      data: { items: [{ productId: piece.id, quantity: 1 }], country: "TN", currency: "TND", city: "Tunis" },
    })
    expect(res.ok()).toBe(true)
    return (await res.json()) as { available: boolean; freeApplied: boolean; amountMinor: number; source: string }
  }

  await step("the owner turns on Aramex pricing and the page says it is simulated", async () => {
    await loginAsOwnerAndWait(page)
    await saveShipping(page.request, true)
    await page.goto(`${E2E.dashboardUrl}/shipping`)
    await expect(page.getByTestId("aramex-simulated")).toContainText("Aramex simulé")
  })

  await step("a Tunisian cart is priced by Aramex in dinars, never converted", async () => {
    const priced = await quote()
    expect(priced.freeApplied).toBe(false)
    expect(priced).toMatchObject({ available: true, source: "aramex" })
    expect(priced.amountMinor % 500).toBe(0)
    await openCheckout(page, { locale: "fr", slug: piece.slug })
    await fillCheckout(page, { locale: "fr", country: "TN" })
    await expect(page.getByText(t("fr", "shipping.carrier"))).toBeVisible()
  })

  await step("with Aramex pricing off the same cart is priced by the flat rates", async () => {
    await saveShipping(page.request, false)
    expect((await quote()).source).toBe("flat")
  })
})
