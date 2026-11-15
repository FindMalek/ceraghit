import { E2E } from "../../env"
import { expect, mailWithSubject, payDemo, placeOrder, test } from "../../fixtures"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { ageOrder, orderRow, stockOf } from "../../support/db"

test("online demo payment settles the order once", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const before = await stockOf(piece.id)
  let number = ""

  await step("pay on the demo gateway", async () => {
    ;({ number } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
    expect((await orderRow(number)).status).toBe("pending_payment")
    expect(await stockOf(piece.id)).toBe(before - 1)
    await payDemo(page, appLocale, "success")
    await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.paid"))
  })

  await step("paid in the database, stock taken once, mail sent", async () => {
    const order = await orderRow(number)
    expect(order).toMatchObject({ status: "paid", currency: "TND", paymentMethod: "online", paymentProvider: "demo" })
    expect(order.paidAt).not.toBeNull()
    await page.reload()
    await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.paid"))
    expect(await stockOf(piece.id)).toBe(before - 1)
    expect((await mailWithSubject(number)).subject).toContain(number)
  })
})

test("online demo failure cancels the order and frees the stock", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const before = await stockOf(piece.id)
  let number = ""

  await step("fail on the demo gateway", async () => {
    ;({ number } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
    await payDemo(page, appLocale, "fail")
    await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.cancelled"))
  })

  await step("cancelled, never paid, stock back", async () => {
    const order = await orderRow(number)
    expect(order.status).toBe("cancelled")
    expect(order.paidAt).toBeNull()
    expect(await stockOf(piece.id)).toBe(before)
  })
})

test(
  "an abandoned online order stays pending, then its hold expires",
  { tag: "@fr" },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""
    let token = ""

    await step("leave the gateway without choosing", async () => {
      ;({ number, token } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
      await page.goto(`${E2E.webUrl}/order/${number}?t=${token}`)
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.pending_payment"))
      expect((await orderRow(number)).status).toBe("pending_payment")
      expect(await stockOf(piece.id)).toBe(before - 1)
    })

    await step("46 minutes later another order frees the hold", async () => {
      await ageOrder(number, 46)
      const res = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
        data: {
          items: [{ productId: piece.id, quantity: 1 }],
          currency: "TND",
          locale: "fr",
          paymentMethod: "cod",
          country: "TN",
          customerName: "Test Client",
          email: "client@e2e.local",
          phone: "+21620000000",
          city: "Tunis",
          address: "1 rue de test",
        },
      })
      expect(res.ok()).toBe(true)
      expect((await orderRow(number)).status).toBe("cancelled")
      expect(await stockOf(piece.id)).toBe(before - 1)
      await page.reload()
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.cancelled"))
    })
  },
)
