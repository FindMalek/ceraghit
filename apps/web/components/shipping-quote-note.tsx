"use client"

import { formatMoney } from "@workspace/sdk"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import type { useShippingQuote } from "@/lib/use-shipping-quote"
import { useCurrency } from "./currency-provider"

type Quote = ReturnType<typeof useShippingQuote>

export function ShippingAmount({ quote }: { quote: Quote }) {
  const t = useTranslations("shipping")
  const locale = useLocale()
  const { currency } = useCurrency()
  if (quote.isPending) return <Skeleton className="h-4 w-16" />
  if (quote.isError || !quote.data?.available) return <span className="text-muted-foreground">{t("onQuote")}</span>
  return <span className="tabular-nums">{formatMoney(quote.data.amountMinor, currency, locale)}</span>
}

export function ShippingDetail({ quote }: { quote: Quote }) {
  const t = useTranslations("shipping")
  if (!quote.data?.available) return null
  return (
    <p className="text-muted-foreground text-xs">
      {t("detail", { zone: quote.data.zoneName ?? "", kg: quote.data.chargeableKg })}
    </p>
  )
}

export function ShippingUnavailable({ quote }: { quote: Quote }) {
  const t = useTranslations("shipping")
  if (quote.isPending || quote.data?.available) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {t("tooBig")}{" "}
      <Link href="/custom" className="underline underline-offset-4">
        {t("contact")}
      </Link>
    </p>
  )
}
