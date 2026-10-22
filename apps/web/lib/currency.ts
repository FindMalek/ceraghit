import type { Currency } from "@workspace/sdk"

export const CURRENCY_COOKIE = "ceraghit_currency"
export const DEFAULT_CURRENCY: Currency = "TND"

export function parseCurrency(value: string | undefined): Currency {
  return value === "EUR" || value === "TND" ? value : DEFAULT_CURRENCY
}
