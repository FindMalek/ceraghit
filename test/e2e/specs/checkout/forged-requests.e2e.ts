import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { pieceFor } from "../../support/catalogue"
import { orderCount, orderRow, stockOf } from "../../support/db"

test("forged payment and price requests change nothing", { tag: ["@fr", "@desktop"] }, async ({ page }, testInfo) => {
  const request = page.request
  const piece = await pieceFor(request, testInfo)

  await test.step("demo-resolve refuses an unknown reference and a cash on delivery order number", async () => {
    const made = await request.post(`${E2E.apiUrl}/v1/orders`, {
      data: {
        items: [{ productId: piece.id, quantity: 1 }],
        currency: "TND",
        locale: "fr",
        paymentMethod: "cod",
        country: "TN",
        ...BUYER,
      },
    })
    const cod = (await made.json()) as { number: string }
    for (const ref of ["demo_does_not_exist", cod.number]) {
      const res = await request.post(`${E2E.apiUrl}/v1/orders/demo-resolve`, { data: { ref, outcome: "paid" } })
      expect(res.status()).toBe(404)
    }
    const order = await orderRow(cod.number)
    expect(order.status).toBe("pending_payment")
    expect(order.paidAt).toBeNull()
  })

  await test.step("extra price and status fields in a new order are ignored", async () => {
    const ordersBefore = await orderCount()
    const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
      data: {
        items: [{ productId: piece.id, quantity: 1, priceTnd: 1, unitMinor: 1 }],
        currency: "TND",
        locale: "fr",
        paymentMethod: "cod",
        country: "TN",
        ...BUYER,
        status: "paid",
        totalMinor: 1,
        subtotalMinor: 1,
        shippingMinor: 0,
        paidAt: new Date().toISOString(),
      },
    })
    expect(res.ok()).toBe(true)
    const { number } = (await res.json()) as { number: string }
    const order = await orderRow(number)
    expect(order.status).toBe("pending_payment")
    expect(order.paidAt).toBeNull()
    expect(order.subtotalMinor).toBe(piece.prices.TND)
    expect(order.totalMinor).toBeGreaterThan(1)
    expect(await orderCount()).toBe(ordersBefore + 1)
    expect(await stockOf(piece.id)).toBe(piece.stock - 2)
  })
})
