import { pick } from "@workspace/sdk"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CategoryChips } from "@/components/category-chips"
import { CategoryHeading } from "@/components/category-heading"
import { EmptyState } from "@/components/empty-state"
import { ProductGrid } from "@/components/product-card"
import { ShopFilters } from "@/components/shop-filters"
import { getCategories, getProducts } from "@/lib/api"
import { getCurrency } from "@/lib/currency-server"
import { parseSort } from "@/lib/shop"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ category: string }> }

export async function generateMetadata({ params }: Params) {
  const [{ category: slug }, locale] = await Promise.all([params, getLocale()])
  const category = (await getCategories()).find((c) => c.slug === slug)
  return { title: category ? pick(category.name, locale) : undefined }
}

export default async function CategoryPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const [{ category: slug }, query, t, locale, currency] = await Promise.all([
    params,
    searchParams,
    getTranslations("shop"),
    getLocale(),
    getCurrency(),
  ])
  const categories = await getCategories()
  const index = categories.findIndex((c) => c.slug === slug)
  const category = categories[index]
  if (!category) notFound()
  const products = await getProducts({ category: slug, q: query.q, sort: parseSort(query.sort), currency, limit: 100 })
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <h1 className="sr-only">{pick(category.name, locale)}</h1>
      <CategoryHeading category={category} index={index} />
      <CategoryChips categories={categories} locale={locale} activeLabel={t("all")} active={slug} />
      <ShopFilters />
      {products.length === 0 ? (
        <EmptyState message={t("empty")} cta={t("emptyCta")} />
      ) : (
        <ProductGrid products={products} currency={currency} priorityCount={4} />
      )}
    </div>
  )
}
