import type { Currency } from "@workspace/sdk"

export const CURRENCY_COOKIE = "ceraghit_currency"
export const DEFAULT_CURRENCY: Currency = "TND"

export function parseCurrency(value: string | undefined): Currency {
  return value === "EUR" || value === "TND" ? value : DEFAULT_CURRENCY
}

/** First visit, before any choice: Tunisia pays in dinars, everywhere else in euros. Hosts set one of these country headers. */
export function detectCurrency(headers: Headers): Currency {
  const country = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry")
  if (country && /^[A-Za-z]{2}$/.test(country) && country.toUpperCase() !== "XX") {
    return country.toUpperCase() === "TN" ? "TND" : "EUR"
  }
  return DEFAULT_CURRENCY
}
