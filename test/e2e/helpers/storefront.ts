import { E2E } from "../env"

export const CURRENCY_COOKIE = "ceraghit_currency"

export function forceCurrency(context: import("@playwright/test").BrowserContext, currency: "TND" | "EUR") {
  return context.addCookies([{ name: CURRENCY_COOKIE, value: currency, url: E2E.webUrl }])
}
