"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"
import type { Product } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { maxQuantity, useCartStore } from "@/lib/cart-store"
import { useUiStore } from "@/lib/ui-store"

export function AddToCart({ product }: { product: Product }) {
  const t = useTranslations("product")
  const [quantity, setQuantity] = useState(1)
  const add = useCartStore((s) => s.add)
  const setCartOpen = useUiStore((s) => s.setCartOpen)
  const max = maxQuantity(product)
  const soldOut = product.stock <= 0

  const onAdd = () => {
    add(product, quantity)
    toast.success(t("added"))
    setCartOpen(true)
  }

  return (
    <div className="space-y-4">
      {!product.unique && !soldOut && (
        <div className="flex items-center gap-4">
          <span id="qty-label" className="font-heading text-muted-foreground text-sm">
            {t("quantity")}
          </span>
          <div role="group" aria-labelledby="qty-label" className="frame flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("decrease")}
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => q - 1)}
            >
              <MinusIcon />
            </Button>
            <output className="min-w-10 text-center tabular-nums" aria-live="polite">
              {quantity}
            </output>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("increase")}
              disabled={quantity >= max}
              onClick={() => setQuantity((q) => q + 1)}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
      )}
      <Button size="lg" className="h-12 w-full text-base" disabled={soldOut} onClick={onAdd}>
        {t("add")}
      </Button>
      {!soldOut && !product.unique && product.stock <= 3 && (
        <p className="text-muted-foreground text-sm">
          {product.stock === 1 ? t("lastOne") : t("fewLeft", { count: product.stock })}
        </p>
      )}
    </div>
  )
}
