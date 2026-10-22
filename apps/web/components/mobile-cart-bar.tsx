"use client"

import { BasketIcon } from "@phosphor-icons/react"
import { formatMoney } from "@workspace/sdk"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "@/i18n/navigation"
import { itemCount, subtotal, useCartStore } from "@/lib/cart-store"
import { useUiStore } from "@/lib/ui-store"
import { useHydrated } from "@/lib/use-hydrated"
import { useCurrency } from "./currency-provider"

const HIDDEN_ON = ["/checkout", "/cart", "/order"]

/** Thumb-reach cart shortcut on phones, only when the cart has something in it. */
export function MobileCartBar() {
  const t = useTranslations("cart")
  const locale = useLocale()
  const pathname = usePathname()
  const hydrated = useHydrated()
  const { currency } = useCurrency()
  const lines = useCartStore((s) => s.lines)
  const setOpen = useUiStore((s) => s.setCartOpen)
  if (!hydrated || lines.length === 0 || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-background/95 p-3 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-between bg-primary px-4 font-heading text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <BasketIcon className="size-5" />
          {t("items", { count: itemCount(lines) })}
        </span>
        <span className="tabular-nums">{formatMoney(subtotal(lines, currency), currency, locale)}</span>
      </button>
    </div>
  )
}
