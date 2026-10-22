"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"
import { formatMoney, type Product, pick } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { maxQuantity, useCartStore } from "@/lib/cart-store"
import { useUiStore } from "@/lib/ui-store"
import { useCurrency } from "./currency-provider"
import { PriceBox } from "./price-box"

export function AddToCart({ product }: { product: Product }) {
  const t = useTranslations("product")
  const locale = useLocale()
  const { currency } = useCurrency()
  const [quantity, setQuantity] = useState(1)
  const [variantId, setVariantId] = useState<string | null>(
    () => (product.variants.find((v) => v.stock > 0) ?? product.variants[0])?.id ?? null,
  )
  const variant = product.variants.find((v) => v.id === variantId)
  const add = useCartStore((s) => s.add)
  const setCartOpen = useUiStore((s) => s.setCartOpen)
  const available = variant ?? product
  const max = maxQuantity({ unique: product.unique, stock: available.stock })
  const soldOut = available.stock <= 0

  const onAdd = () => {
    add(product, quantity, variant)
    toast.success(t("added"))
    setCartOpen(true)
  }

  return (
    <div className="space-y-4">
      {variant && (
        <>
          <fieldset className="space-y-2">
            <legend className="font-heading text-muted-foreground text-sm">{t("option")}</legend>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <label
                  key={v.id}
                  className={cn(
                    "frame flex min-h-11 cursor-pointer flex-col justify-center px-4 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    v.id === variant.id && "bg-primary text-primary-foreground",
                    v.stock <= 0 && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    className="sr-only"
                    checked={v.id === variant.id}
                    disabled={v.stock <= 0}
                    onChange={() => {
                      setVariantId(v.id)
                      setQuantity(1)
                    }}
                  />
                  <span>{pick(v.label, locale)}</span>
                  <span className="text-sm tabular-nums">
                    {v.stock <= 0 ? t("variantSoldOut") : formatMoney(v.prices[currency], currency, locale)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <PriceBox minor={variant.prices[currency]} currency={currency} locale={locale} className="text-2xl" />
        </>
      )}
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
      {!soldOut && !product.unique && available.stock <= 3 && (
        <p className="text-muted-foreground text-sm">
          {available.stock === 1 ? t("lastOne") : t("fewLeft", { count: available.stock })}
        </p>
      )}
    </div>
  )
}
