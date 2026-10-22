"use client"

import type { SHIPPING_COUNTRIES } from "@workspace/sdk"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useShippingQuote } from "@/lib/use-shipping-quote"
import { CountrySelect } from "./country-select"
import { useCurrency } from "./currency-provider"
import { ShippingAmount, ShippingDetail, ShippingUnavailable } from "./shipping-quote-note"

export function ShippingEstimate({ productId }: { productId: string }) {
  const t = useTranslations("shipping")
  const { currency } = useCurrency()
  const [country, setCountry] = useState<(typeof SHIPPING_COUNTRIES)[number]>("TN")
  const quote = useShippingQuote([{ productId, quantity: 1 }], country, currency)

  return (
    <details className="frame group bg-card/40">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 font-heading text-sm">
        {t("estimate")}
      </summary>
      <div className="space-y-3 border-border border-t p-4">
        <CountrySelect id="estimate-country" label={t("to")} value={country} onChange={setCountry} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("label")}</span>
          <ShippingAmount quote={quote} />
        </div>
        <ShippingDetail quote={quote} />
        <ShippingUnavailable quote={quote} />
      </div>
    </details>
  )
}
