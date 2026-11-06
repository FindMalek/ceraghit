import { getTranslations } from "next-intl/server"
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og"

export const alt = "Ceraghit"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params
  const t = await getTranslations({ locale, namespace: "legal" })
  const known = ["terms", "shipping", "notice", "privacy"].includes(doc)
  return ogImage({ locale, title: known ? t(`nav.${doc}` as "nav.terms") : "Ceraghit", subtitle: undefined })
}
