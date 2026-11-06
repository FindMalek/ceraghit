import { getTranslations } from "next-intl/server"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"
import { STUDIO_PHOTOS } from "@/lib/site"

export const alt = "Ceraghit"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "atelier" })
  return ogImage({
    locale,
    title: t("title"),
    subtitle: t("lead"),
    image: await ogPhoto(STUDIO_PHOTOS[0]!.src),
  })
}
