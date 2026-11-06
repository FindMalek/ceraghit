import { getTranslations } from "next-intl/server"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage, ogPhoto } from "@/lib/og"

export const alt = "Ceraghit"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "custom" })
  return ogImage({
    locale,
    title: t("title"),
    subtitle: t("intro"),
    image: await ogPhoto("/catalogue/0001-1.webp"),
  })
}
