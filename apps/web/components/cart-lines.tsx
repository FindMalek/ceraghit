"use client"

import { MinusIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { formatMoney, imageSrc, pick } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { type CartLine, maxQuantity, useCartStore } from "@/lib/cart-store"
import { useCurrency } from "./currency-provider"

export function CartLines({ lines, onNavigate }: { lines: CartLine[]; onNavigate?: () => void }) {
  const t = useTranslations()
  const locale = useLocale()
  const { currency } = useCurrency()
  const { setQuantity, remove } = useCartStore.getState()
  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => {
        const title = pick(line.title, locale)
        return (
          <li key={line.productId} className="flex gap-4 py-4">
            <Link
              href={`/product/${line.slug}`}
              onClick={onNavigate}
              className="frame relative block size-24 shrink-0 overflow-hidden"
            >
              {line.image && <Image src={imageSrc(line.image)} alt="" fill sizes="96px" className="object-cover" />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-heading text-muted-foreground text-xs">
                {t("common.reference")} {line.ref}
              </p>
              <p className="font-display text-gold text-xl leading-tight">{title}</p>
              <p className="font-heading text-sm">{formatMoney(line.prices[currency], currency, locale)}</p>
              <div className="mt-auto flex items-center justify-between gap-2">
                {line.unique ? (
                  <span className="text-muted-foreground text-sm">{t("cart.uniqueNote")}</span>
                ) : (
                  <div className="frame flex items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-9"
                      aria-label={t("product.decrease")}
                      disabled={line.quantity <= 1}
                      onClick={() => setQuantity(line.productId, line.quantity - 1)}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="min-w-8 text-center tabular-nums" aria-live="polite">
                      {line.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-9"
                      aria-label={t("product.increase")}
                      disabled={line.quantity >= maxQuantity(line)}
                      onClick={() => setQuantity(line.productId, line.quantity + 1)}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:size-9"
                  aria-label={t("cart.remove", { title })}
                  onClick={() => remove(line.productId)}
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
