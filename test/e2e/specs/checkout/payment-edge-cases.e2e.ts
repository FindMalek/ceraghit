import { E2E } from "../../env"
import { expect, placeOrder, test } from "../../fixtures"
import { fillCheckout, openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { ageOrder, auditRows, mailKinds, orderRow, stockOf } from "../../support/db"

function demoRef(url: string): string {
  return new URL(url).searchParams.get("ref") ?? ""
}

test(
  "a payment of the wrong amount never settles the order and is audited",
  { tag: ["@fr", "@desktop"] },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""

    await step("the gateway reports another amount", async () => {
      ;({ number } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
      await page.getByRole("button", { name: t(appLocale, "demo.mismatch") }).click()
      await page.waitForURL(/\/order\/[^/?]+\?t=/)
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.pending_payment"))
    })

    await step("still pending, never paid, stock held, no mail, mismatch on record", async () => {
      const order = await orderRow(number)
      expect(order.status).toBe("pending_payment")
      expect(order.paidAt).toBeNull()
      expect(await stockOf(piece.id)).toBe(before - 1)
      expect((await auditRows(number)).map((a) => a.action)).toContain("gateway_mismatch")
      expect(await mailKinds(number)).toEqual({})
    })
  },
)

test(
  "a settled demo payment cannot be replayed to flip the order",
  { tag: ["@fr", "@desktop"] },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""
    let ref = ""

    await step("pay on the gateway", async () => {
      ;({ number } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
      ref = demoRef(page.url())
      await page.getByRole("button", { name: t(appLocale, "demo.pay") }).click()
      await page.waitForURL(/\/order\/[^/?]+\?t=/)
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.paid"))
    })

    await step("the old reference no longer answers and the order stays paid", async () => {
      for (const outcome of ["failed", "paid"] as const) {
        const res = await page.request.post(`${E2E.apiUrl}/v1/orders/demo-resolve`, { data: { ref, outcome } })
        expect(res.status()).toBe(404)
      }
      expect((await orderRow(number)).status).toBe("paid")
      expect(await stockOf(piece.id)).toBe(before - 1)
      await page.reload()
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.paid"))
    })
  },
)

test(
  "a payment attempt after the hold expired is refused and the order stays cancelled",
  { tag: ["@fr", "@desktop"] },
  async ({ page, step, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const before = await stockOf(piece.id)
    let number = ""
    let token = ""
    let ref = ""

    await step("the buyer leaves the gateway and the hold expires", async () => {
      ;({ number, token } = await placeOrder(page, { locale: appLocale, method: "online", productSlug: piece.slug }))
      ref = demoRef(page.url())
      await ageOrder(number, 46)
      await expect
        .poll(async () => {
          await page.request.post(`${E2E.apiUrl}/cron/release-holds`, {
            headers: { authorization: `Bearer ${E2E.cronSecret}` },
          })
          return (await orderRow(number)).status
        })
        .toBe("cancelled")
      await page.goto(`${E2E.webUrl}/order/${number}?t=${token}`)
    })

    await step("the order page shows it cancelled and the stock is back", async () => {
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.cancelled"))
      expect((await orderRow(number)).status).toBe("cancelled")
      expect(await stockOf(piece.id)).toBe(before)
    })

    await step("the gateway can no longer pay it: the order stays cancelled and unpaid", async () => {
      const res = await page.request.post(`${E2E.apiUrl}/v1/orders/demo-resolve`, { data: { ref, outcome: "paid" } })
      expect(res.status()).toBe(404)
      const order = await orderRow(number)
      expect(order.status).toBe("cancelled")
      expect(order.paidAt).toBeNull()
      expect(await stockOf(piece.id)).toBe(before)
      await page.reload()
      await expect(page.getByRole("status").first()).toContainText(t(appLocale, "order.status.cancelled"))
    })
  },
)

test("a double click on the order button creates one order", async ({ page, step, appLocale }, testInfo) => {
  const piece = await pieceFor(page.request, testInfo)
  const before = await stockOf(piece.id)
  let number = ""

  await step("fill the form and click twice", async () => {
    await openCheckout(page, { locale: appLocale, slug: piece.slug })
    await fillCheckout(page, { locale: appLocale, country: "TN", method: "cod" })
    await page.getByRole("button", { name: t(appLocale, "checkout.placeOrder") }).dblclick()
    await page.waitForURL(/\/order\/[^/?]+\?t=/)
    number = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "")
  })

  await step("one unit taken and one confirmation per recipient", async () => {
    expect(await stockOf(piece.id)).toBe(before - 1)
    const both = { order_confirmation: 1, order_studio: 1 }
    await expect.poll(async () => mailKinds(number, "sent")).toEqual(both)
    expect(await mailKinds(number), "no failed or duplicate row").toEqual(both)
  })
})
