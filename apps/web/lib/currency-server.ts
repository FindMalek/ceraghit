import "server-only"
import type { Currency } from "@workspace/sdk"
import { cookies } from "next/headers"
import { CURRENCY_COOKIE, parseCurrency } from "./currency"

export async function getCurrency(): Promise<Currency> {
  return parseCurrency((await cookies()).get(CURRENCY_COOKIE)?.value)
}
