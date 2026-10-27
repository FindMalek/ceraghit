import "server-only"
import type { Currency } from "@workspace/sdk"
import { cookies, headers } from "next/headers"
import { CURRENCY_COOKIE, detectCurrency, parseCurrency } from "./currency"

export async function getCurrency(): Promise<Currency> {
  const chosen = (await cookies()).get(CURRENCY_COOKIE)?.value
  return chosen ? parseCurrency(chosen) : detectCurrency(await headers())
}
