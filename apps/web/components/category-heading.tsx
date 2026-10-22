import type { Category } from "@workspace/sdk"
import { pick } from "@workspace/sdk"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

/** The catalogue's section opener: a big rotated number beside the collection name. */
export function CategoryHeading({
  category,
  index,
  asLink = false,
}: {
  category: Category
  index: number
  asLink?: boolean
}) {
  const t = useTranslations("shop")
  const locale = useLocale()
  const number = String(index + 1).padStart(2, "0")
  const title = pick(category.name, locale)
  return (
    <div className="flex items-end gap-4 md:gap-6">
      <span
        aria-hidden
        className="font-display text-6xl text-gold/70 [writing-mode:vertical-rl] md:text-8xl rotate-180"
      >
        {number}
      </span>
      <div className="pb-1">
        <h2 className="text-4xl md:text-6xl">
          {asLink ? <Link href={`/shop/${category.slug}`}>{title}</Link> : title}
        </h2>
        <p className="font-heading text-muted-foreground text-sm">{t("results", { count: category.productCount })}</p>
      </div>
    </div>
  )
}
