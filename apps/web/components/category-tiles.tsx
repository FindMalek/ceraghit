import type { Category } from "@workspace/sdk"
import { imageSrc, pick } from "@workspace/sdk"
import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import { Link } from "@/i18n/navigation"

/** The shop's collections as photo tiles. On a collection page the current one is highlighted and the tiles are shorter. */
export function CategoryTiles({
  categories,
  locale,
  active,
  compact,
}: {
  categories: Category[]
  locale: string
  active?: string
  compact?: boolean
}) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category, i) => (
        <li key={category.id}>
          <Link
            href={`/shop/${category.slug}`}
            aria-current={active === category.slug ? "page" : undefined}
            className={cn(
              "frame group relative block overflow-hidden bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "aspect-[3/2]" : "aspect-[4/5]",
              active && active !== category.slug && "opacity-60 transition-opacity hover:opacity-100",
              active === category.slug && "ring-2 ring-primary",
            )}
          >
            {category.image && (
              <Image
                src={imageSrc(category.image)}
                alt=""
                fill
                priority={i < 4}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <span className="absolute inset-x-4 bottom-4 flex items-end gap-3">
              <span aria-hidden className={cn("font-display text-gold", compact ? "text-4xl" : "text-6xl")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "font-heading text-gold leading-tight",
                  compact ? "text-lg md:text-xl" : "text-2xl md:text-3xl",
                )}
              >
                {pick(category.name, locale)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
