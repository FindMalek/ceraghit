import { getTranslations } from "next-intl/server"
import { getSiteImages } from "@/lib/api"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"
import { siteImages } from "@/lib/site-images"

export const alt = "Ceraghit Creation"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "home" })
  const photo = await ogPhoto(siteImages("og-home", await getSiteImages(), locale)[0]?.src)
  return ogImage({
    locale,
    eyebrow: t("kicker"),
    title: "Ceraghit Creation",
    subtitle: t("subtitle"),
    image: photo,
    degraded: !photo,
  })
}
