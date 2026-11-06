import { pick } from "@workspace/sdk"
import { getTranslations } from "next-intl/server"
import { getCategories } from "@/lib/api"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"

export const alt = "Ceraghit"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string; category: string }> }) {
  const { locale, category: slug } = await params
  const [t, nav, categories] = await Promise.all([
    getTranslations({ locale, namespace: "shop" }),
    getTranslations({ locale, namespace: "nav" }),
    getCategories(),
  ])
  const category = categories.find((c) => c.slug === slug)
  return ogImage({
    locale,
    eyebrow: nav("shop"),
    title: category ? pick(category.name, locale) : t("title"),
    subtitle: category ? t("results", { count: category.productCount }) : undefined,
    image: category?.image ? await ogPhoto(category.image) : undefined,
  })
}
