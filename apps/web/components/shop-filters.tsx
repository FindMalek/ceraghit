"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useId } from "react"
import { usePathname, useRouter } from "@/i18n/navigation"

const SORTS = ["featured", "price-asc", "price-desc", "newest"] as const
const SORT_KEYS = {
  featured: "sortFeatured",
  "price-asc": "sortPriceAsc",
  "price-desc": "sortPriceDesc",
  newest: "sortNewest",
} as const

export function ShopFilters() {
  const t = useTranslations("shop")
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const id = useId()

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    update("q", String(new FormData(event.currentTarget).get("q") ?? "").trim())
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <form onSubmit={onSearch} role="search" className="flex flex-1 gap-2">
        <label htmlFor={`${id}-q`} className="sr-only">
          {t("searchLabel")}
        </label>
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder={t("searchPlaceholder")}
          className="h-11 flex-1"
        />
        <Button type="submit" variant="outline" size="icon" className="size-11" aria-label={t("search")}>
          <MagnifyingGlassIcon />
        </Button>
      </form>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-sort`} className="font-heading text-muted-foreground text-sm">
          {t("sortLabel")}
        </label>
        <select
          id={`${id}-sort`}
          value={params.get("sort") ?? "featured"}
          onChange={(event) => update("sort", event.target.value === "featured" ? "" : event.target.value)}
          className="frame h-11 min-w-40 bg-input/30 px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort} className="bg-popover">
              {t(SORT_KEYS[sort])}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
