"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, pick } from "@workspace/sdk"
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
  if (quote.data.freeApplied) return <span className="text-jade">{t("free")}</span>
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

/** "Plus que 45 DT pour la livraison offerte", only while the zone has a threshold the cart has not reached. */
export function ShippingNudge({ quote }: { quote: Quote }) {
  const t = useTranslations("shipping")
  const locale = useLocale()
  const { currency } = useCurrency()
  const data = quote.data
  if (!data?.available || data.freeApplied || data.freeOverMinor === null) return null
  const missing = Math.max(0, data.freeOverMinor - data.subtotalMinor)
  return <p className="text-gold text-xs">{t("nudge", { amount: formatMoney(missing, currency, locale) })}</p>
}

/** The owner's delivery note from the settings (for example dispatch times), in the visitor's language. */
export function ShippingNote() {
  const locale = useLocale()
  const settings = useQuery(orpc.public.catalog.settings.queryOptions({ staleTime: 5 * 60_000 }))
  const note = pick(settings.data?.shippingNote, locale)
  if (!note) return null
  return <p className="text-muted-foreground text-xs">{note}</p>
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
