import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { localePath } from "../../helpers/locale"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { orderRow } from "../../support/db"

test("the order page reads in the project locale", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const res = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: piece.id, quantity: 1 }],
      currency: "TND",
      locale: appLocale,
      paymentMethod: "cod",
      country: "TN",
      ...BUYER,
    },
  })
  const created = (await res.json()) as { number: string; token: string }
  const placed = { number: created.number, token: created.token }
  const url = `${E2E.webUrl}${localePath(appLocale, `/order/${placed.number}`)}?t=${placed.token}`

  await step("open it with the link token", async () => {
    await page.goto(url)
    await expect(page.getByRole("status")).toContainText(t(appLocale, "order.codTitle"))
    await expect(page.getByRole("heading", { level: 1 })).toContainText(placed.number)
    const order = await orderRow(placed.number)
    expect(order.currency).toBe("TND")
    await expect(
      page
        .locator("dt", { hasText: t(appLocale, "order.total") })
        .locator("xpath=following-sibling::dd[1]")
        .last(),
    ).toContainText(String(Math.floor(order.totalMinor / 1000)))
  })

  await step("a wrong token shows nothing about the order", async () => {
    await page.goto(`${E2E.webUrl}${localePath(appLocale, `/order/${placed.number}`)}?t=wrong-token`)
    await expect(page.getByText(t(appLocale, "order.notFound"))).toBeVisible()
    const html = await page.content()
    expect(html).not.toContain("Test Client")
    expect(html).not.toContain("1 rue de test")
  })

  await step("no token at all is the same", async () => {
    await page.goto(`${E2E.webUrl}${localePath(appLocale, `/order/${placed.number}`)}`)
    await expect(page.getByText(t(appLocale, "order.notFound"))).toBeVisible()
  })
})
