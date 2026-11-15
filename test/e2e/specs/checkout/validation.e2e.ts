import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

test("an empty checkout shows every required error and creates nothing", async ({
  page,
  step,
  appLocale,
}, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  let posted = 0
  page.on("request", (r) => r.method() === "POST" && /\/orders$/.test(r.url()) && posted++)

  await step("submit the empty form", async () => {
    await openCheckout(page, { locale: appLocale, slug: piece.slug })
    await page
      .getByRole("button", {
        name: new RegExp(`^${t(appLocale, "checkout.placeOrder")}|^${t(appLocale, "checkout.pay").split("{")[0]}`),
      })
      .click()
    for (const field of ["customerName", "email", "phone", "city", "address", "terms"]) {
      await expect(page.getByText(t(appLocale, `checkout.errors.${field}`))).toBeVisible()
    }
    await expect(page.getByLabel(t(appLocale, "checkout.name"))).toBeFocused()
    expect(posted).toBe(0)
  })

  await step("an invalid email only flags the email", async () => {
    await page.getByLabel(t(appLocale, "checkout.name")).fill("Test Client")
    await page.getByLabel(t(appLocale, "checkout.email")).fill("not-an-email")
    await page
      .getByRole("button", {
        name: new RegExp(`^${t(appLocale, "checkout.placeOrder")}|^${t(appLocale, "checkout.pay").split("{")[0]}`),
      })
      .click()
    await expect(page.getByText(t(appLocale, "checkout.errors.email"))).toBeVisible()
    await expect(page.getByText(t(appLocale, "checkout.errors.customerName"))).toBeHidden()
    expect(posted).toBe(0)
  })
})

test("the api refuses cash on delivery outside Tunisia", { tag: "@fr" }, async ({ page }, testInfo) => {
  const request = page.request
  const piece = await pieceFor(request, testInfo)
  const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: piece.id, quantity: 1 }],
      currency: "EUR",
      locale: "fr",
      paymentMethod: "cod",
      country: "FR",
      customerName: "Test Client",
      email: "client@e2e.local",
      phone: "+33600000000",
      city: "Paris",
      address: "1 rue de test",
    },
  })
  expect(res.status()).toBe(400)
  expect(await res.text()).toContain("payment_method_unavailable")
})
