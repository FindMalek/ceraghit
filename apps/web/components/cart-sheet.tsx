"use client"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { itemCount, useCartStore } from "@/lib/cart-store"
import { useUiStore } from "@/lib/ui-store"
import { CartLines } from "./cart-lines"
import { CartSummary } from "./cart-summary"

export function CartSheet() {
  const t = useTranslations("cart")
  const open = useUiStore((s) => s.cartOpen)
  const setOpen = useUiStore((s) => s.setCartOpen)
  const lines = useCartStore((s) => s.lines)
  const close = () => setOpen(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-border border-b">
          <SheetTitle className="font-display text-3xl text-gold">{t("title")}</SheetTitle>
          <SheetDescription>{t("items", { count: itemCount(lines) })}</SheetDescription>
        </SheetHeader>
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-muted-foreground">{t("empty")}</p>
            <Link
              href="/shop"
              onClick={close}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
            >
              {t("emptyCta")}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4">
              <CartLines lines={lines} onNavigate={close} />
            </div>
            <SheetFooter className="gap-4 border-border border-t">
              <CartSummary lines={lines} />
              <Link
                href="/checkout"
                onClick={close}
                className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}
              >
                {t("checkout")}
              </Link>
              <Button variant="ghost" className="h-11" onClick={close}>
                {t("continue")}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
