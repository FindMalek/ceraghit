import type { Category } from "@workspace/sdk"
import { pick } from "@workspace/sdk"
import { cn } from "@workspace/ui/lib/utils"
import { Link } from "@/i18n/navigation"

export function CategoryChips({
  categories,
  locale,
  activeLabel,
  active,
}: {
  categories: Category[]
  locale: string
  activeLabel: string
  active?: string
}) {
  const chip = "frame inline-flex min-h-11 items-center px-4 font-heading text-sm tracking-wide transition-colors"
  return (
    <nav aria-label="Catégories" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        <li>
          <Link
            href="/shop"
            aria-current={!active ? "page" : undefined}
            className={cn(chip, !active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {activeLabel}
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={`/shop/${c.slug}`}
              aria-current={active === c.slug ? "page" : undefined}
              className={cn(chip, active === c.slug ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {pick(c.name, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
