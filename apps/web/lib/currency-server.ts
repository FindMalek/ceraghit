import "server-only"
import type { Currency } from "@workspace/sdk"
import { cookies, headers } from "next/headers"
import { CURRENCY_COOKIE, detectCurrency, parseCurrency } from "./currency"
import { SITE } from "./site"

/** Production only trusts the visitor's country. Local and previews can force a currency with the cookie, to test both. */
export async function getCurrency(): Promise<Currency> {
  const forced = SITE.isProduction ? undefined : (await cookies()).get(CURRENCY_COOKIE)?.value
  return forced ? parseCurrency(forced) : detectCurrency(await headers())
}
