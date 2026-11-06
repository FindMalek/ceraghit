import { getTranslations } from "next-intl/server"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"
import { HERO_PHOTOS } from "@/lib/site"

export const alt = "Ceraghit Creation"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "home" })
  return ogImage({
    locale,
    eyebrow: t("kicker"),
    title: "Ceraghit Creation",
    subtitle: t("subtitle"),
    image: await ogPhoto(HERO_PHOTOS[0]!),
  })
}
