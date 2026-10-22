import { pick } from "@workspace/sdk"
import { getLocale, getTranslations } from "next-intl/server"
import { CategoryChips } from "@/components/category-chips"
import { CategoryHeading } from "@/components/category-heading"
import { EmptyState } from "@/components/empty-state"
import { ProductGrid } from "@/components/product-card"
import { ShopFilters } from "@/components/shop-filters"
import { Link } from "@/i18n/navigation"
import { getCategories, getProducts } from "@/lib/api"
import { getCurrency } from "@/lib/currency-server"
import { pageMetadata } from "@/lib/seo"
import { parseSort } from "@/lib/shop"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const [locale, t, seo] = await Promise.all([getLocale(), getTranslations("shop"), getTranslations("seo")])
  return pageMetadata({ locale, path: "/shop", title: t("title"), description: seo("shopDescription") })
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const [t, locale, currency, query] = await Promise.all([
    getTranslations("shop"),
    getLocale(),
    getCurrency(),
    searchParams,
  ])
  const filtered = Boolean(query.q || query.sort)
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ q: query.q, sort: parseSort(query.sort), currency, limit: 100 }),
  ])
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-5xl md:text-7xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <CategoryChips categories={categories} locale={locale} activeLabel={t("all")} />
      <ShopFilters />
      {products.length === 0 ? (
        <EmptyState message={t("empty")} cta={t("emptyCta")} />
      ) : filtered ? (
        <>
          <p className="font-heading text-muted-foreground text-sm">{t("results", { count: products.length })}</p>
          <ProductGrid products={products} currency={currency} priorityCount={4} />
        </>
      ) : (
        <div className="space-y-16">
          {categories.map((category, index) => {
            const items = products.filter((p) => p.category.id === category.id)
            if (items.length === 0) return null
            return (
              <section key={category.id} className="space-y-6">
                <CategoryHeading category={category} index={index} asLink />
                <ProductGrid products={items.slice(0, 8)} currency={currency} priorityCount={index === 0 ? 4 : 0} />
                {items.length > 8 && (
                  <Link
                    href={`/shop/${category.slug}`}
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    {t("seeAll")} · {pick(category.name, locale)}
                  </Link>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
