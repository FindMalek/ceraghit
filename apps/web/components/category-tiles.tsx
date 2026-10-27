import type { Category } from "@workspace/sdk"
import { imageSrc, pick } from "@workspace/sdk"
import Image from "next/image"
import { Link } from "@/i18n/navigation"

/** The shop's collections as large photo tiles. */
export function CategoryTiles({ categories, locale }: { categories: Category[]; locale: string }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category, i) => (
        <li key={category.id}>
          <Link
            href={`/shop/${category.slug}`}
            className="frame group relative block aspect-[4/5] overflow-hidden bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {category.image && (
              <Image
                src={imageSrc(category.image)}
                alt=""
                fill
                priority={i < 3}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <span className="absolute inset-x-4 bottom-4 flex items-end gap-3">
              <span aria-hidden className="font-display text-6xl text-gold">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-heading text-2xl text-gold leading-tight md:text-3xl">
                {pick(category.name, locale)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
