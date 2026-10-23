import { imageSrc, pick } from "@workspace/sdk"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"
import { JsonLd } from "@/components/json-ld"
import { ProductGrid } from "@/components/product-card"
import { SectionHeading } from "@/components/section-heading"
import { Link } from "@/i18n/navigation"
import { getCategories, getProducts, getSettings } from "@/lib/api"
import { getCurrency } from "@/lib/currency-server"
import { organizationJsonLd } from "@/lib/json-ld"
import { pageMetadata } from "@/lib/seo"
import { STUDIO_PHOTOS } from "@/lib/site"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("meta")])
  return pageMetadata({
    locale,
    path: "",
    title: { absolute: t("title") },
    description: t("description"),
  })
}

export default async function HomePage() {
  const [t, edito, locale, currency] = await Promise.all([
    getTranslations("home"),
    getTranslations("edito"),
    getLocale(),
    getCurrency(),
  ])
  const [categories, featured, settings] = await Promise.all([
    getCategories(),
    getProducts({ featured: true, sort: "featured", currency, limit: 8 }),
    getSettings(),
  ])
  return (
    <>
      <JsonLd data={organizationJsonLd(settings)} />
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <div className="space-y-6 text-center lg:text-start">
          <Image
            src="/logo.webp"
            alt=""
            width={96}
            height={96}
            priority
            className="mx-auto size-24 rounded-full lg:mx-0"
          />
          <p className="font-script text-5xl text-gold">{t("kicker")}</p>
          <h1 className="text-7xl xl:text-9xl">Ceraghit</h1>
          <p className="mx-auto max-w-md text-lg text-muted-foreground lg:mx-0">{t("subtitle")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/shop" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
              {t("ctaShop")}
            </Link>
            <Link
              href="/custom"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-6 text-base")}
            >
              {t("ctaCustom")}
            </Link>
          </div>
        </div>
        <div className="frame relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-card">
          <Image
            src="/catalogue/0200-1.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 28rem, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl space-y-8 px-4 py-12">
          <SectionHeading title={t("featured")} />
          <ProductGrid products={featured} currency={currency} />
        </section>
      )}

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl space-y-8 px-4 py-12">
          <SectionHeading title={t("categories")} />
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {categories.map((category, i) => (
              <li key={category.id}>
                <Link
                  href={`/shop/${category.slug}`}
                  className="frame group relative block aspect-[3/4] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {category.image && (
                    <Image
                      src={imageSrc(category.image)}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover opacity-60 transition duration-500 group-hover:scale-105 group-hover:opacity-80"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
                  <span className="absolute inset-x-3 bottom-3 flex items-end gap-2">
                    <span aria-hidden className="font-display text-5xl text-gold">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-heading text-xl text-gold leading-tight md:text-2xl">
                      {pick(category.name, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-3xl space-y-6 px-4 py-16 text-center">
        <SectionHeading title={t("editoTitle")} />
        <p className="text-xl">{edito("p1")}</p>
        <p className="text-muted-foreground">{edito("p2")}</p>
        <Link href="/atelier" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
          {t("editoMore")}
        </Link>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 py-12">
        <SectionHeading title={t("studio")} />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STUDIO_PHOTOS.map((photo) => (
            <li key={photo.src} className="frame relative aspect-[4/5] overflow-hidden bg-card">
              <Image src={photo.src} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <div className="frame space-y-4 bg-card/70 p-8 text-center">
          <h2 className="text-4xl">{t("customTitle")}</h2>
          <p className="text-muted-foreground">{t("customText")}</p>
          <Link href="/custom" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}>
            {t("customCta")}
          </Link>
        </div>
      </section>
    </>
  )
}
