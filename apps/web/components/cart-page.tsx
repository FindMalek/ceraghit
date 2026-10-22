"use client"

import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { useCartStore } from "@/lib/cart-store"
import { useHydrated } from "@/lib/use-hydrated"
import { CartLines } from "./cart-lines"
import { CartSummary } from "./cart-summary"

export function CartPage() {
  const t = useTranslations("cart")
  const hydrated = useHydrated()
  const lines = useCartStore((s) => s.lines)
  if (!hydrated) return <div className="h-64" aria-busy />
  if (lines.length === 0) {
    return (
      <div className="frame flex flex-col items-center gap-4 bg-card/60 p-10 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
        <Link href="/shop" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
          {t("emptyCta")}
        </Link>
      </div>
    )
  }
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <CartLines lines={lines} />
      <aside className="frame h-fit space-y-4 bg-card/70 p-6">
        <CartSummary lines={lines} />
        <p className="text-muted-foreground text-xs">{t("priceNote")}</p>
        <Link href="/checkout" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}>
          {t("checkout")}
        </Link>
        <Link href="/shop" className={cn(buttonVariants({ variant: "ghost" }), "h-11 w-full")}>
          {t("continue")}
        </Link>
      </aside>
    </div>
  )
}
