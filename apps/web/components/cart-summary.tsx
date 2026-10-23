"use client"

import { formatMoney } from "@workspace/sdk"
import { useLocale, useTranslations } from "next-intl"
import { type CartLine, subtotal } from "@/lib/cart-store"
import { useShippingQuote } from "@/lib/use-shipping-quote"
import { useCurrency } from "./currency-provider"
import { ShippingNudge } from "./shipping-quote-note"

export function useCartTotals(lines: CartLine[]) {
  const { currency } = useCurrency()
  return { currency, subtotal: subtotal(lines, currency) }
}

/** Subtotal only: the delivery price depends on the country, so it is calculated at checkout. The nudge assumes Tunisia. */
export function CartSummary({ lines }: { lines: CartLine[] }) {
  const t = useTranslations("cart")
  const locale = useLocale()
  const { currency, subtotal: sub } = useCartTotals(lines)
  const quote = useShippingQuote(
    lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
    "TN",
    currency,
  )
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between font-heading text-lg">
        <dt>{t("subtotal")}</dt>
        <dd className="tabular-nums">{formatMoney(sub, currency, locale)}</dd>
      </div>
      <p className="text-muted-foreground text-xs">{t("shippingNext")}</p>
      <ShippingNudge quote={quote} />
    </dl>
  )
}
