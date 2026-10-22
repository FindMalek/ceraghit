"use client"

import { formatMoney } from "@workspace/sdk"
import { useLocale, useTranslations } from "next-intl"
import { type CartLine, subtotal } from "@/lib/cart-store"
import { useCurrency } from "./currency-provider"

export function useCartTotals(lines: CartLine[]) {
  const { currency } = useCurrency()
  return { currency, subtotal: subtotal(lines, currency) }
}

/** Subtotal only: the delivery price depends on the country, so it is calculated at checkout. */
export function CartSummary({ lines }: { lines: CartLine[] }) {
  const t = useTranslations("cart")
  const locale = useLocale()
  const { currency, subtotal: sub } = useCartTotals(lines)
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between font-heading text-lg">
        <dt>{t("subtotal")}</dt>
        <dd className="tabular-nums">{formatMoney(sub, currency, locale)}</dd>
      </div>
      <p className="text-muted-foreground text-xs">{t("shippingNext")}</p>
    </dl>
  )
}
