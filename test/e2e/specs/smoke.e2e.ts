import { E2E } from "../env"
import { expect, payDemo, placeOrder, test } from "../fixtures"
import { t } from "../helpers/messages"

const PRICE = /\d\s(DT|د\.ت|€)/

test("storefront home loads in the project locale", async ({ page, home, step, appLocale }) => {
  await step("open the home page", async () => {
    await page.goto(home())
    await expect(page.locator("html")).toHaveAttribute("lang", appLocale)
    await expect(page.locator("html")).toHaveAttribute("dir", appLocale === "ar" ? "rtl" : "ltr")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("deliberate failure")
  })
})

test("a product from the shop shows its price", async ({ page, home, step }) => {
  await step("open the shop", async () => {
    await page.goto(home("/shop"))
    await expect(page.getByRole("article").first()).toBeVisible()
  })
  await step("open the first product", async () => {
    await page.getByRole("article").first().getByRole("link").first().click()
    await expect(page).toHaveURL(/\/product\//)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByText(PRICE).first()).toBeVisible()
  })
})

test("a cash on delivery order reaches the dashboard", { tag: "@fr" }, async ({ page, ownerPage, step, appLocale }) => {
  let number = ""
  await step("place a cash on delivery order in Tunisia", async () => {
    ;({ number } = await placeOrder(page, { locale: appLocale, method: "cod" }))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(number)
  })
  await step(
    "the owner sees it in the orders list",
    async () => {
      await ownerPage.goto(`${E2E.dashboardUrl}/orders`)
      await ownerPage.getByPlaceholder("Numéro, nom ou email").fill(number)
      const rows = ownerPage.getByText(/^CER-\d+$/).filter({ visible: true })
      await expect(rows).toHaveCount(1)
      await expect(rows).toHaveText(number)
    },
    ownerPage,
  )
})

test("an online demo payment marks the order paid", { tag: ["@fr", "@desktop"] }, async ({ page, step, appLocale }) => {
  await step("place an online order", async () => {
    await placeOrder(page, { locale: appLocale, method: "online" })
    await expect(page).toHaveURL(/\/checkout\/demo\?/)
  })
  await step("pay on the demo gateway", async () => {
    await payDemo(page, appLocale, "success")
    await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.paid"))
  })
})
