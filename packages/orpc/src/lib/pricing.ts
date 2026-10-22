import type { Currency } from "@workspace/sdk"

interface Priced {
  priceTnd: number
  priceEur: number
}

/** The unit price of a cart line: the chosen variant's price, or the piece's own when it has none. */
export function unitMinor(row: Priced, variant: Priced | undefined, currency: Currency): number {
  const priced = variant ?? row
  return currency === "TND" ? priced.priceTnd : priced.priceEur
}
