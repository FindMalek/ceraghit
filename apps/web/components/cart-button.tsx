"use client"

import { BasketIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"
import { itemCount, useCartStore } from "@/lib/cart-store"
import { useUiStore } from "@/lib/ui-store"
import { useHydrated } from "@/lib/use-hydrated"
import { CartSheet } from "./cart-sheet"

export function CartButton() {
  const t = useTranslations("cart")
  const hydrated = useHydrated()
  const count = useCartStore((s) => itemCount(s.lines))
  const setOpen = useUiStore((s) => s.setCartOpen)
  const shown = hydrated ? count : 0
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-11 md:size-9"
        aria-label={t("open", { count: shown })}
        onClick={() => setOpen(true)}
      >
        <BasketIcon className="size-6 md:size-5" />
        {shown > 0 && (
          <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary font-heading text-primary-foreground text-xs"
          >
            {shown}
          </span>
        )}
      </Button>
      <CartSheet />
    </>
  )
}
