import { type Currency, fromMinor, toMinor } from "@workspace/sdk"

const DECIMALS: Record<Currency, number> = { TND: 3, EUR: 2 }

/** What the owner sees in a price input: "10", "34.5". */
export function minorToInput(minor: number, currency: Currency): string {
  return String(fromMinor(minor, currency))
}

/** Parses "10", "10,5" or "34.50" to minor units, or null when it is not a valid non-negative amount. */
export function inputToMinor(text: string, currency: Currency): number | null {
  const clean = text.trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(clean)) return null
  const [, decimals = ""] = clean.split(".")
  if (decimals.length > DECIMALS[currency]) return null
  return toMinor(Number(clean), currency)
}

export const DECIMALS_OF = DECIMALS
