import type { APIRequestContext, TestInfo } from "@playwright/test"
import { EMAIL_COPY } from "../../../../packages/orpc/src/emails/copy"
import { E2E } from "../../env"
import { expect, mailWithSubject, orderMails, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { pieceFor } from "../../support/catalogue"
import { ageOrder, orderRow } from "../../support/db"

/** On the worker's own piece, so the stock of the specs running beside this one never moves. */
async function place(
  request: APIRequestContext,
  testInfo: TestInfo,
  input: { method: "cod" | "transfer"; country: string; currency: "TND" | "EUR"; locale: "fr" | "en" | "ar" },
): Promise<{ number: string; token: string }> {
  const piece = await pieceFor(request, testInfo)
  const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: piece.id, quantity: 1 }],
      currency: input.currency,
      locale: input.locale,
      paymentMethod: input.method,
      country: input.country,
      ...BUYER,
    },
  })
  expect(res.ok()).toBe(true)
  return (await res.json()) as { number: string; token: string }
}

const FORBIDDEN = [
  "undefined",
  "[object",
  "NaN",
  "null",
  "postgres://",
  E2E.cronSecret,
  E2E.adminPassword,
  "SECRETS_KEY",
  "DATABASE_URL",
]

function expectClean(text: string): void {
  for (const bad of FORBIDDEN) expect(text, `mail text must not contain ${bad}`).not.toContain(bad)
}

const METHODS = [
  { method: "cod", country: "TN", currency: "TND", studio: "(paiement à la livraison)" },
  { method: "transfer", country: "FR", currency: "EUR", studio: "(virement à recevoir)" },
] as const

test.describe("confirmation mails", () => {
  for (const { method, country, currency, studio } of METHODS) {
    test(
      `${method}: the customer mail and the studio mail read right in the order language`,
      {
        tag: ["@desktop"],
      },
      async ({ page, step, appLocale }, testInfo) => {
        const copy = EMAIL_COPY[appLocale]
        let order = { number: "", token: "" }

        await step("place the order over the api in the project language", async () => {
          order = await place(page.request, testInfo, { method, country, currency, locale: appLocale })
        })

        await step("the customer mail has the subject, the intro, the total and one working order link", async () => {
          const { buyer } = await orderMails(order.number)
          expect(buyer.subject).toBe(copy.confirmation.subject(order.number))
          expect(buyer.to).toContain("client@e2e.local")
          expect(buyer.text).toContain(copy.common.hello("Test Client"))
          expect(buyer.text).toContain(method === "cod" ? copy.confirmation.cod : copy.confirmation.transfer)
          expect(buyer.text).toContain(copy.common.total)
          const sign = currency === "EUR" ? "€" : "DT"
          expect(buyer.text.includes(sign) || buyer.text.includes("TND") || buyer.text.includes("د.ت")).toBe(true)
          const link = buyer.text.match(
            new RegExp(`${E2E.webUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*/order/${order.number}\\?t=([\\w-]+)`),
          )
          expect(link, "the order link carries the public token").not.toBeNull()
          expect(link?.[1]).toBe(order.token)
          if (method === "transfer") expect(buyer.text).toContain(copy.confirmation.reference)
          expectClean(buyer.text)
        })

        await step("the studio mail is French, tied to the buyer by reply-to and has no public token", async () => {
          const { studio: mail } = await orderMails(order.number)
          expect(mail.subject).toBe(`Nouvelle commande ${order.number} ${studio}`)
          expect(mail.text).toContain("Test Client")
          expect(mail.text).not.toContain(order.token)
          expectClean(mail.text)
        })
      },
    )
  }
})

test(
  "an unpaid transfer that expires gets a cancellation mail in the order language",
  {
    tag: ["@desktop"],
  },
  async ({ page, step, appLocale }, testInfo) => {
    const copy = EMAIL_COPY[appLocale]
    const order = await place(page.request, testInfo, {
      method: "transfer",
      country: "FR",
      currency: "EUR",
      locale: appLocale,
    })

    await step("the hold runs out", async () => {
      await ageOrder(order.number, 8 * 24 * 60)
      await expect
        .poll(async () => {
          const res = await page.request.post(`${E2E.apiUrl}/cron/release-holds`, {
            headers: { authorization: `Bearer ${E2E.cronSecret}` },
          })
          expect(res.status()).toBe(200)
          return (await orderRow(order.number)).status
        })
        .toBe("cancelled")
    })

    await step("the customer is told, with the reason and a way to order again", async () => {
      const mail = await mailWithSubject(copy.expired.subject(order.number))
      expect(mail.to).toContain("client@e2e.local")
      expect(mail.text).toContain(copy.expired.body(7))
      expect(mail.text).toContain(copy.expired.again)
      expectClean(mail.text)
    })
  },
)
