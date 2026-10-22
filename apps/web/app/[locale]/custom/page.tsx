import { pick } from "@workspace/sdk"
import { getLocale, getTranslations } from "next-intl/server"
import { CustomForm } from "@/components/custom-form"
import { getProducts } from "@/lib/api"
import { pageMetadata } from "@/lib/seo"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const [locale, t, seo] = await Promise.all([getLocale(), getTranslations("custom"), getTranslations("seo")])
  return pageMetadata({ locale, path: "/custom", title: t("title"), description: seo("customDescription") })
}

export default async function CustomPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const [{ ref }, t, locale] = await Promise.all([searchParams, getTranslations("custom"), getLocale()])
  const match = ref
    ? (await getProducts({ q: ref, sort: "featured", currency: "TND", limit: 5 })).find((p) => p.ref === ref)
    : undefined
  const initialDescription = match ? t("prefill", { ref: match.ref, title: pick(match.title, locale) }) : undefined
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <header className="space-y-4 text-center">
        <h1 className="text-5xl md:text-6xl">{t("title")}</h1>
        <div className="ornament mx-auto max-w-xs" aria-hidden>
          <span>◆</span>
        </div>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <CustomForm initialDescription={initialDescription} />
    </div>
  )
}
