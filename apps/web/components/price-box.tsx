import type { Currency } from "@workspace/sdk"
import { formatMoney } from "@workspace/sdk"
import { cn } from "@workspace/ui/lib/utils"

/** The thin gold box the catalogue puts around every price. */
export function PriceBox({
  minor,
  currency,
  locale,
  className,
}: {
  minor: number
  currency: Currency
  locale: string
  className?: string
}) {
  return (
    <span className={cn("frame inline-block px-4 py-1.5 font-heading text-lg tabular-nums", className)}>
      {formatMoney(minor, currency, locale)}
    </span>
  )
}
