import { formatMoney, pick } from "@workspace/sdk"
import { getTranslations } from "next-intl/server"
import { getProduct } from "@/lib/api"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"

export const alt = "Ceraghit"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const [common, product] = await Promise.all([getTranslations({ locale, namespace: "common" }), getProduct(slug)])
  if (!product) return ogImage({ locale, title: "Ceraghit" })
  // Both prices belong to the product (the owner sets each), so both are shown side by side, never converted.
  const price = product.quoteOnly
    ? common("quoteOnly")
    : `${formatMoney(product.prices.TND, "TND", locale)}  ·  ${formatMoney(product.prices.EUR, "EUR", locale)}`
  return ogImage({
    locale,
    eyebrow: product.unique ? common("uniquePiece") : `${common("reference")} ${product.ref}`,
    title: pick(product.title, locale),
    subtitle: [pick(product.material, locale), product.dimensions].filter(Boolean).join(" · "),
    footer: price,
    image: product.images[0] ? await ogPhoto(product.images[0].image) : undefined,
  })
}
