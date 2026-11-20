import { EMAIL_COPY } from "../../../../packages/orpc/src/emails/copy"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { pieceFor } from "../../support/catalogue"
import { mailKinds, orderId, orderRow } from "../../support/db"
import { mailWithSubject } from "../../support/mailpit"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const LOCALES = ["fr", "en", "ar"] as const

test(
  "the customer gets one payment mail and one shipped mail, in the language of the order",
  { tag: ["@fr"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    await loginAsOwnerAndWait(page)
    const post = (path: string, data: object) =>
      page.request.post(`${E2E.apiUrl}/v1/admin/orders/${path}`, { headers: { "x-csrf-token": "orpc" }, data })

    for (const locale of LOCALES) {
      const copy = EMAIL_COPY[locale]
      await step(`${locale}: the payment received mail follows a payment confirmed by the owner`, async () => {
        const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
          data: {
            items: [{ productId: piece.id, quantity: 1 }],
            currency: "EUR",
            locale,
            paymentMethod: "transfer",
            country: "FR",
            ...BUYER,
          },
        })
        expect(made.ok()).toBe(true)
        const { number } = (await made.json()) as { number: string }
        const order = await orderRow(number)
        const id = await orderId(number)

        const paid = await post(`${id}/mark-paid`, {
          method: "transfer",
          reference: null,
          note: null,
          totalMinor: order.totalMinor,
          currency: "EUR",
        })
        expect(paid.ok()).toBe(true)
        const mail = await mailWithSubject(copy.paymentReceived.subject(number))
        expect(mail.subject).toBe(copy.paymentReceived.subject(number))
        expect(mail.text).toContain(number)

        const shipped = await post(`${id}/ship`, {
          id,
          carrier: "rapid-poste",
          trackingNumber: `RR${number.replace(/\D/g, "").slice(-8)}TN`,
          trackingUrl: "https://suivi.example.test/track",
        })
        expect(shipped.ok()).toBe(true)
        const shippedMail = await mailWithSubject(copy.shipped.subject(number))
        expect(shippedMail.subject).toBe(copy.shipped.subject(number))
        expect(shippedMail.text).toContain(copy.shipped.intro)
        expect(shippedMail.text).toContain(`RR${number.replace(/\D/g, "").slice(-8)}TN`)
        expect(shippedMail.text).toContain("https://suivi.example.test/track")

        const tracking = await page.request.patch(`${E2E.apiUrl}/v1/admin/orders/${id}/tracking`, {
          headers: { "x-csrf-token": "orpc" },
          data: {
            id,
            carrier: "rapid-poste",
            trackingNumber: "CORRECTED1",
            trackingUrl: "https://suivi.example.test/c",
          },
        })
        expect(tracking.ok()).toBe(true)
        const kinds = await mailKinds(number)
        expect(kinds.payment_received, "one payment mail").toBe(1)
        expect(kinds.shipped, "one shipped mail, a tracking correction sends none").toBe(1)
      })
    }
  },
)
