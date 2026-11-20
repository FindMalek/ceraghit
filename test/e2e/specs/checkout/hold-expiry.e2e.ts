import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { pieceFor } from "../../support/catalogue"
import { ageOrder, orderRow, stockOf } from "../../support/db"

const DAY = 24 * 60

test(
  "an unpaid transfer order is cancelled after its hold and the piece goes back on sale",
  {
    tag: ["@fr", "@desktop"],
  },
  async ({ page, step }, testInfo) => {
    const api = page.request
    const piece = await pieceFor(api, testInfo)
    const stock = await stockOf(piece.id)
    const place = async (paymentMethod: "transfer" | "cod") => {
      const made = await api.post(`${E2E.apiUrl}/v1/orders`, {
        data: {
          items: [{ productId: piece.id, quantity: 1 }],
          currency: paymentMethod === "transfer" ? "EUR" : "TND",
          locale: "fr",
          paymentMethod,
          country: paymentMethod === "transfer" ? "FR" : "TN",
          ...BUYER,
        },
      })
      expect(made.ok()).toBe(true)
      return (await made.json()) as { number: string; token: string }
    }
    const show = (order: { number: string; token: string }) =>
      page.goto(`${E2E.webUrl}/order/${order.number}?t=${order.token}`)
    const release = async () => {
      const res = await api.post(`${E2E.apiUrl}/cron/release-holds`, {
        headers: { authorization: `Bearer ${E2E.cronSecret}` },
      })
      expect(res.status()).toBe(200)
    }

    const transfer = await place("transfer")
    const cod = await place("cod")
    expect(await stockOf(piece.id), "both orders hold a piece").toBe(stock - 2)

    await step("inside the hold nothing is released", async () => {
      await ageOrder(transfer.number, 6 * DAY)
      await release()
      expect((await orderRow(transfer.number)).status).toBe("pending_payment")
      await show(transfer)
    })
    await step("past the 7 day transfer hold the order is cancelled and its stock comes back", async () => {
      await ageOrder(transfer.number, 2 * DAY)
      await release()
      expect((await orderRow(transfer.number)).status).toBe("cancelled")
      expect(await stockOf(piece.id)).toBe(stock - 1)
    })
    await step("a cash on delivery order has no hold: it stays pending however old it is", async () => {
      await ageOrder(cod.number, 60 * DAY)
      await release()
      expect((await orderRow(cod.number)).status).toBe("pending_payment")
      expect(await stockOf(piece.id)).toBe(stock - 1)
    })
  },
)
