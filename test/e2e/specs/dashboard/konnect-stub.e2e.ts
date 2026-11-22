import type { APIRequestContext, Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, mailWithSubject, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"
import { ageOrder, auditRows, orderRow, stockOf } from "../../support/db"
import { konnectPaymentFor, STUB_KONNECT_KEY, setKonnectPayment } from "../../support/stubs"

const WALLET = "e2e-wallet-1234"
const CSRF = { "x-csrf-token": "orpc" }

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const clearKeys = (page: Page) => page.request.delete(`${E2E.apiUrl}/v1/admin/settings/konnect`, { headers: CSRF })

/** An online order paid through Konnect: the api answers with the stub's pay page. */
async function konnectOrder(
  request: APIRequestContext,
  productId: string,
): Promise<{ number: string; token: string; payUrl: string }> {
  const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId, quantity: 1 }],
      currency: "TND",
      locale: "fr",
      paymentMethod: "online",
      country: "TN",
      customerName: "Test Client",
      email: "client@e2e.local",
      phone: "+21620000000",
      city: "Tunis",
      address: "1 rue de test",
    },
  })
  expect(res.ok()).toBe(true)
  const created = (await res.json()) as { number: string; token: string; payUrl: string }
  expect(created.payUrl).toContain(`${E2E.stubUrl}/konnect/pay/`)
  return created
}

/** Past its hold and released, so the keys unlock and the piece's stock is back before the next test resets it. */
async function expireOrder(page: Page, number: string): Promise<void> {
  await ageOrder(number, 60)
  await expect
    .poll(async () => {
      await page.request.post(`${E2E.apiUrl}/cron/release-holds`, {
        headers: { authorization: `Bearer ${E2E.cronSecret}` },
      })
      return (await orderRow(number)).status
    })
    .not.toBe("pending_payment")
}

const orderPage = (number: string, token: string) => `${E2E.webUrl}/order/${number}?t=${token}`

test("the owner saves Konnect sandbox keys and the connection test tells good from bad", {
  tag: ["@fr"],
}, async ({ page, step, shot }) => {
  await loginAsOwnerAndWait(page)
  await clearKeys(page)
  try {
    await step("a refused key is reported", async () => {
      await page.goto(`${E2E.dashboardUrl}/payments`)
      await page.getByLabel("Clé API", { exact: true }).fill("wrong-key-0000")
      await page.getByLabel("Identifiant du portefeuille (wallet ID)").fill(WALLET)
      await page.getByRole("button", { name: "Tester la connexion" }).click()
      await expect(page.getByText("Clé API refusée par Konnect.")).toBeVisible()
    })

    await step("the sandbox key is accepted and saved", async () => {
      await page.getByLabel("Clé API", { exact: true }).fill(STUB_KONNECT_KEY)
      await page.getByRole("button", { name: "Tester la connexion" }).click()
      await expect(page.getByText(/Clé API acceptée par Konnect/)).toBeVisible()
      await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click()
      await expect(page.getByText("Clés Konnect enregistrées.")).toBeVisible()
      await shot("konnect-stub-keys")
    })
  } finally {
    await clearKeys(page)
  }
})

test.describe("payments through the Konnect sandbox stub", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwnerAndWait(page)
    await clearKeys(page)
    const res = await page.request.put(`${E2E.apiUrl}/v1/admin/settings/konnect`, {
      headers: CSRF,
      data: { apiKey: STUB_KONNECT_KEY, walletId: WALLET, mode: "test" },
    })
    expect(res.ok()).toBe(true)
  })

  test.afterEach(async ({ page }) => {
    await clearKeys(page)
  })

  test("a paid payment settles the order once, with its mail", { tag: ["@fr"] }, async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const order = await konnectOrder(page.request, piece.id)
    try {
      await step("the buyer pays on the Konnect page", async () => {
        expect((await orderRow(order.number)).paymentProvider).toBe("konnect")
        expect(await stockOf(piece.id)).toBe(piece.stock - 1)
        await page.goto(order.payUrl)
        await page.getByRole("link", { name: "Pay", exact: true }).click()
        await page.waitForURL(/\/order\/[^/?]+/)
        await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.paid"))
      })

      await step("paid in the database with the stub's amount, stock kept, mail sent", async () => {
        const row = await orderRow(order.number)
        expect(row).toMatchObject({ status: "paid", currency: "TND", paymentMethod: "online" })
        expect(row.paidAt).not.toBeNull()
        expect((await konnectPaymentFor(order.number)).amount).toBe(row.totalMinor)
        await page.reload()
        expect(await stockOf(piece.id)).toBe(piece.stock - 1)
        expect((await mailWithSubject(order.number)).subject).toContain(order.number)
      })
    } finally {
      await expireOrder(page, order.number)
    }
  })

  test("a failed payment cancels the order and frees the stock", { tag: ["@fr"] }, async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const order = await konnectOrder(page.request, piece.id)
    try {
      await step("the buyer's payment fails", async () => {
        await page.goto(order.payUrl)
        await page.getByRole("link", { name: "Payment failed" }).click()
        await page.waitForURL(/\/order\/[^/?]+/)
        await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.cancelled"))
      })

      await step("cancelled, never paid, stock back", async () => {
        const row = await orderRow(order.number)
        expect(row.status).toBe("cancelled")
        expect(row.paidAt).toBeNull()
        expect(await stockOf(piece.id)).toBe(piece.stock)
      })
    } finally {
      await expireOrder(page, order.number)
    }
  })

  test(
    "leaving the pay page keeps the order pending until Konnect completes it",
    { tag: ["@fr"] },
    async ({ page, step }, testInfo) => {
      const piece = await pieceFor(page.request, testInfo)
      const order = await konnectOrder(page.request, piece.id)
      try {
        await step("the buyer cancels on the Konnect page", async () => {
          await page.goto(order.payUrl)
          await page.getByRole("link", { name: "Cancel and go back" }).click()
          await page.waitForURL(/\/order\/[^/?]+/)
          await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.pending_payment"))
          expect((await orderRow(order.number)).status).toBe("pending_payment")
          expect(await stockOf(piece.id)).toBe(piece.stock - 1)
        })

        await step("Konnect completes it later and the order page settles it", async () => {
          const payment = await konnectPaymentFor(order.number)
          await setKonnectPayment(payment.ref, { status: "completed" })
          await page.goto(orderPage(order.number, order.token))
          await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.paid"))
          expect((await orderRow(order.number)).status).toBe("paid")
        })
      } finally {
        await expireOrder(page, order.number)
      }
    },
  )

  test("a payment of another amount never settles the order", { tag: ["@fr"] }, async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const order = await konnectOrder(page.request, piece.id)
    try {
      await step("Konnect reports paid with a different amount", async () => {
        const payment = await konnectPaymentFor(order.number)
        await setKonnectPayment(payment.ref, { status: "completed", amount: payment.amount + 1 })
        await page.goto(orderPage(order.number, order.token))
        await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.pending_payment"))
      })

      await step("pending, held, mismatch on record, no mail", async () => {
        const row = await orderRow(order.number)
        expect(row.status).toBe("pending_payment")
        expect(row.paidAt).toBeNull()
        expect((await auditRows(order.number)).map((a) => a.action)).toContain("gateway_mismatch")
      })
    } finally {
      await expireOrder(page, order.number)
    }
  })

  test(
    "a payment after the hold expired is recorded as late and the order stays cancelled",
    {
      tag: ["@fr"],
    },
    async ({ page, step }, testInfo) => {
      const piece = await pieceFor(page.request, testInfo)
      const order = await konnectOrder(page.request, piece.id)

      await step("the hold expires and the order is cancelled", async () => {
        await ageOrder(order.number, 46)
        await expect
          .poll(async () => {
            await page.request.post(`${E2E.apiUrl}/cron/release-holds`, {
              headers: { authorization: `Bearer ${E2E.cronSecret}` },
            })
            return (await orderRow(order.number)).status
          })
          .toBe("cancelled")
        expect(await stockOf(piece.id)).toBe(piece.stock)
      })

      await step("Konnect then reports it paid: late_payment is audited, nothing else changes", async () => {
        const payment = await konnectPaymentFor(order.number)
        await setKonnectPayment(payment.ref, { status: "completed" })
        expect((await page.request.post(`${E2E.apiUrl}/webhooks/konnect?payment_ref=${payment.ref}`)).ok()).toBe(true)
        await page.goto(orderPage(order.number, order.token))
        await expect(page.getByRole("status").first()).toContainText(t("fr", "order.status.cancelled"))
        await expect.poll(async () => (await auditRows(order.number)).map((a) => a.action)).toContain("late_payment")
        const row = await orderRow(order.number)
        expect(row.status).toBe("cancelled")
        expect(row.paidAt).toBeNull()
        expect(await stockOf(piece.id)).toBe(piece.stock)
      })
    },
  )
})
