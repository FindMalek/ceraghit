import type { Currency, Product } from "@workspace/sdk"
import { imageSrc, pick } from "@workspace/sdk"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { InView } from "@/components/in-view"
import Image from "@/components/photo"
import { Link } from "@/i18n/navigation"
import { PriceBox } from "./price-box"

function Tag({ children }: { children: string }) {
  return (
    <span className="frame bg-background/85 px-2 py-0.5 font-heading text-[0.7rem] uppercase tracking-widest backdrop-blur">
      {children}
    </span>
  )
}

export function ProductCard({
  product,
  currency,
  priority = false,
  defer = false,
}: {
  product: Product
  currency: Currency
  priority?: boolean
  /** Far below the first screen: the photo only loads when the card is about to be seen. */
  defer?: boolean
}) {
  const t = useTranslations("common")
  const locale = useLocale()
  const soldOut = product.stock <= 0
  const fromPrice = new Set(product.variants.map((v) => v.prices[currency])).size > 1
  const cover = product.images[0]
  const photo = cover && (
    <Image
      src={imageSrc(cover.image)}
      alt={pick(cover.alt, locale) || pick(product.title, locale)}
      fill
      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
      priority={priority}
      className={cn("object-cover transition duration-500 group-hover:scale-105", soldOut && "opacity-50")}
    />
  )
  return (
    <article className="group relative flex flex-col gap-3">
      <div className="frame relative aspect-square overflow-hidden bg-card">
        {defer ? (
          <>
            <InView>{photo}</InView>
            <noscript>{photo}</noscript>
          </>
        ) : (
          photo
        )}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {soldOut && <Tag>{t("soldOut")}</Tag>}
          {product.unique && <Tag>{t("uniquePiece")}</Tag>}
          {product.quoteOnly && <Tag>{t("quoteOnly")}</Tag>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-heading text-muted-foreground text-xs">
          {t("reference")}: <bdi>{product.ref}</bdi>
        </p>
        <h3 className="text-2xl leading-tight">
          <Link
            href={`/product/${product.slug}`}
            className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {pick(product.title, locale)}
          </Link>
        </h3>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {fromPrice && <span className="text-muted-foreground text-xs">{t("from")}</span>}
          <PriceBox minor={product.prices[currency]} currency={currency} locale={locale} className="text-base" />
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({
  products,
  currency,
  priorityCount = 0,
  defer = false,
}: {
  products: Product[]
  currency: Currency
  priorityCount?: number
  defer?: boolean
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
      {products.map((product, i) => (
        <li key={product.id}>
          <ProductCard product={product} currency={currency} priority={i < priorityCount} defer={defer} />
        </li>
      ))}
    </ul>
  )
}
