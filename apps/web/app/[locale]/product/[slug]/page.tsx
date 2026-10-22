import { pick } from "@workspace/sdk"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { AddToCart } from "@/components/add-to-cart"
import { JsonLd } from "@/components/json-ld"
import { PriceBox } from "@/components/price-box"
import { ProductGrid } from "@/components/product-card"
import { ProductGallery } from "@/components/product-gallery"
import { SectionHeading } from "@/components/section-heading"
import { ShippingEstimate } from "@/components/shipping-estimate"
import { Link } from "@/i18n/navigation"
import { getProduct, getProducts } from "@/lib/api"
import { getCurrency } from "@/lib/currency-server"
import { breadcrumbJsonLd, productJsonLd } from "@/lib/json-ld"
import { pageMetadata } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()])
  const product = await getProduct(slug)
  if (!product) return {}
  const title = pick(product.title, locale)
  const description =
    pick(product.description, locale) ||
    [pick(product.material, locale), pick(product.technique, locale), product.dimensions].filter(Boolean).join(", ")
  return pageMetadata({
    locale,
    path: `/product/${slug}`,
    title,
    description: description || title,
    image: product.images[0]?.image,
  })
}

export default async function ProductPage({ params }: Params) {
  const [{ slug }, locale, currency, t, common, seo] = await Promise.all([
    params,
    getLocale(),
    getCurrency(),
    getTranslations("product"),
    getTranslations("common"),
    getTranslations("seo"),
  ])
  const product = await getProduct(slug)
  if (!product) notFound()
  const related = (await getProducts({ category: product.category.slug, sort: "featured", currency, limit: 5 }))
    .filter((p) => p.id !== product.id)
    .slice(0, 4)
  const title = pick(product.title, locale)
  const specs = [
    [common("material"), pick(product.material, locale)],
    [common("technique"), pick(product.technique, locale)],
    [common("dimensions"), product.dimensions ?? ""],
  ].filter(([, value]) => value)
  const soldOut = product.stock <= 0
  const quoteHref = `/custom?ref=${encodeURIComponent(product.ref)}`

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <JsonLd data={productJsonLd(product, currency, locale)} />
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: seo("crumbHome"), path: "/" },
            { name: pick(product.category.name, locale), path: `/shop/${product.category.slug}` },
            { name: title, path: `/product/${product.slug}` },
          ],
          locale,
        )}
      />
      <div className="grid gap-8 md:grid-cols-2 md:gap-14">
        <ProductGallery images={product.images} title={title} />
        <div className="space-y-6 md:pt-4">
          <div className="space-y-3">
            <p className="font-heading text-muted-foreground text-sm">
              {common("reference")}: {product.ref}
            </p>
            <div className="ornament max-w-48" aria-hidden>
              <span>◆</span>
            </div>
            <h1 className="text-5xl leading-none md:text-6xl">{title}</h1>
            <p className="font-heading text-muted-foreground text-sm">
              <Link href={`/shop/${product.category.slug}`} className="underline underline-offset-4">
                {pick(product.category.name, locale)}
              </Link>
              {product.unique && ` · ${common("uniquePiece")}`}
            </p>
          </div>

          {product.description && <p className="text-lg">{pick(product.description, locale)}</p>}

          {specs.length > 0 && (
            <dl className="divide-y divide-border border-border border-y">
              {specs.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-4 py-3">
                  <dt className="font-heading text-muted-foreground text-sm">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <PriceBox minor={product.prices[currency]} currency={currency} locale={locale} className="text-2xl" />

          {product.quoteOnly ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">{t("quoteText")}</p>
              <Link href={quoteHref} className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}>
                {t("quoteCta")}
              </Link>
            </div>
          ) : soldOut ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">{t("soldOutText")}</p>
              <Link
                href={quoteHref}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 w-full text-base")}
              >
                {t("similarCta")}
              </Link>
            </div>
          ) : (
            <>
              <AddToCart product={product} />
              {product.unique && <p className="text-muted-foreground text-sm">{t("uniqueNote")}</p>}
              <ShippingEstimate productId={product.id} />
            </>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20 space-y-8">
          <SectionHeading title={t("related")} />
          <ProductGrid products={related} currency={currency} />
        </section>
      )}
    </div>
  )
}
