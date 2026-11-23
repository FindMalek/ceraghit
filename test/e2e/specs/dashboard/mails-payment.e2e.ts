import { EMAIL_COPY } from "../../../../packages/orpc/src/emails/copy"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, mailWithSubject, payDemo, placeOrder, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { pieceFor } from "../../support/catalogue"
import { orderId, orderRow } from "../../support/db"
import { countMailsWithSubject } from "../../support/mail-count"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const LOCALES = ["fr", "en", "ar"] as const
const ADMIN = { "x-csrf-token": "orpc" }

test("an online payment confirmed by the gateway sends one paid confirmation, in the language of the order", async ({
  page,
  step,
}, testInfo) => {
  test.slow()
  const piece = await pieceFor(page.request, testInfo)
  for (const locale of LOCALES) {
    const copy = EMAIL_COPY[locale]
    await step(`${locale}: the mail is sent after the payment, not when the order is created`, async () => {
      const order = await placeOrder(page, { locale, method: "online", productSlug: piece.slug })
      expect(await countMailsWithSubject(order.number)).toBe(0)
      await payDemo(page, locale, "success")
      expect((await orderRow(order.number)).status).toBe("paid")

      const mail = await mailWithSubject(copy.confirmation.subject(order.number))
      expect(mail.subject).toBe(copy.confirmation.subject(order.number))
      expect(mail.to).toContain("client@e2e.local")
      expect(mail.text).toContain(copy.confirmation.paid)
      expect(mail.text).toContain(order.number)
      expect(mail.text).toContain(`/order/${order.number}`)
      expect(mail.text).not.toContain(copy.confirmation.cod)
      expect(mail.text).not.toContain(copy.confirmation.transfer)

      await page.reload()
      await page.waitForLoadState("networkidle")
      const count = () => countMailsWithSubject(copy.confirmation.subject(order.number))
      await expect.poll(count).toBe(1)
      await expect.poll(count, { intervals: [1500], timeout: 3000 }).toBe(1)
    })
  }
})

test("the Payoneer link mail reaches the customer once, with the link and the intro in the order language", async ({
  page,
  step,
}, testInfo) => {
  test.slow()
  const piece = await pieceFor(page.request, testInfo)
  await loginAsOwnerAndWait(page)
  for (const locale of LOCALES) {
    const copy = EMAIL_COPY[locale]
    const link = `https://link.payoneer.com/pay/e2e-${locale}-${Date.now()}`
    await step(`${locale}: the owner sets the link and the customer gets it by email`, async () => {
      const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
        data: {
          items: [{ productId: piece.id, quantity: 1 }],
          currency: "EUR",
          locale,
          paymentMethod: "payoneer",
          country: "FR",
          ...BUYER,
        },
      })
      expect(made.ok()).toBe(true)
      const { number } = (await made.json()) as { number: string }
      expect(await countMailsWithSubject(copy.paymentLink.subject(number))).toBe(0)

      const set = await page.request.post(`${E2E.apiUrl}/v1/admin/orders/${await orderId(number)}/payment-link`, {
        headers: ADMIN,
        data: { link },
      })
      expect(set.ok()).toBe(true)
      expect(((await set.json()) as { emailed: boolean }).emailed).toBe(true)

      const mail = await mailWithSubject(copy.paymentLink.subject(number))
      expect(mail.to).toContain(BUYER.email)
      expect(mail.text).toContain(copy.paymentLink.intro)
      expect(mail.text).toContain(link)
      expect(mail.text).toContain(number)
      expect(mail.text).toContain("€")
      expect(mail.text).not.toMatch(/\bDT\b|د\.ت/)
      expect((await orderRow(number)).status).toBe("pending_payment")
      expect(await countMailsWithSubject(copy.paymentLink.subject(number))).toBe(1)
    })
  }
})

test("the test mail goes to the notification address of the shop and says where it comes from", async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)
  const stamp = Date.now()
  await step("the owner sends a test email from the api", async () => {
    const res = await page.request.post(`${E2E.apiUrl}/v1/admin/mail/test`, { headers: ADMIN, data: {} })
    expect(res.ok()).toBe(true)
    expect(await res.json()).toEqual({ ok: true, to: "shop@e2e.local" })
  })
  await step("Mailpit holds it, addressed to the shop, with the environment and a recent date", async () => {
    const sentMinute = Math.floor(stamp / 60_000) * 60_000
    const dateOf = (text: string) => {
      const [, date] = /Date : (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC/.exec(text) ?? []
      return new Date(`${date}:00Z`).getTime()
    }
    await expect
      .poll(async () => dateOf((await mailWithSubject("Email de test Ceraghit")).text), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(sentMinute)
    const mail = await mailWithSubject("Email de test Ceraghit")
    expect(mail.to).toContain("shop@e2e.local")
    expect(mail.subject).toBe("Email de test Ceraghit")
    expect(mail.text).toContain("Environnement : local")
    expect(dateOf(mail.text)).toBeLessThanOrEqual(Date.now())
  })
})
