"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useCurrency } from "./currency-provider"

const CURRENCIES = ["TND", "EUR"] as const

export function CurrencyToggle({ className }: { className?: string }) {
  const t = useTranslations("currency")
  const { currency, setCurrency } = useCurrency()
  return (
    <div role="group" aria-label={t("switch")} className={cn("frame inline-flex", className)}>
      {CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={currency === code}
          title={t(code)}
          onClick={() => currency !== code && setCurrency(code)}
          className={cn(
            "min-h-11 min-w-12 px-3 font-heading text-sm tracking-wider outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:min-h-9",
            currency === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code === "TND" ? "DT" : "€"}
        </button>
      ))}
    </div>
  )
}
