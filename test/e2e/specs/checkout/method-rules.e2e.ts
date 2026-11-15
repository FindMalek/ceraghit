import { expect, test } from "../../fixtures"
import { openCheckout } from "../../helpers/checkout"
import { t } from "../../helpers/messages"
import { pieceFor } from "../../support/catalogue"

type Method = "methodOnline" | "methodCod" | "methodTransfer"

const MATRIX: { country: string; currency: "TND" | "EUR"; methods: Method[] }[] = [
  { country: "TN", currency: "TND", methods: ["methodOnline", "methodCod"] },
  { country: "TN", currency: "EUR", methods: ["methodOnline"] },
  { country: "FR", currency: "EUR", methods: ["methodOnline", "methodTransfer"] },
  { country: "BE", currency: "EUR", methods: ["methodOnline", "methodTransfer"] },
  { country: "FR", currency: "TND", methods: ["methodOnline", "methodTransfer"] },
]

test(
  "payment methods follow country and currency",
  { tag: ["@fr", "@desktop"] },
  async ({ page, appLocale }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    for (const row of MATRIX) {
      await test.step(`${row.country} in ${row.currency}`, async () => {
        await page.context().clearCookies()
        await openCheckout(page, { locale: appLocale, slug: piece.slug, currency: row.currency })
        await page.getByLabel(t(appLocale, "checkout.country"), { exact: true }).selectOption(row.country)
        const all: Method[] = ["methodOnline", "methodCod", "methodTransfer"]
        for (const method of all) {
          const radio = page.getByRole("radio", { name: t(appLocale, `checkout.${method}`) })
          await (row.methods.includes(method) ? expect(radio).toBeVisible() : expect(radio).toHaveCount(0))
        }
      })
    }
  },
)
