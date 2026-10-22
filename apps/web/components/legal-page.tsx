import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { LEGAL_DOCS, type LegalDoc, type LegalSection } from "@/lib/legal"

export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations("legal")
  const sections = t.raw(`docs.${doc}.sections`) as LegalSection[]
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-4 text-center">
        <h1 className="text-5xl md:text-6xl">{t(`docs.${doc}.title`)}</h1>
        <div className="ornament mx-auto max-w-xs" aria-hidden>
          <span>◆</span>
        </div>
        <p className="text-muted-foreground">{t(`docs.${doc}.intro`)}</p>
      </header>

      <aside role="note" className="frame space-y-1 bg-card/60 p-4 text-center">
        <p className="font-heading text-gold">{t("draft")}</p>
        <p className="text-muted-foreground text-sm">{t("draftNote")}</p>
      </aside>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="font-heading text-2xl text-gold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>

      <nav aria-label={t("navLabel")} className="border-border border-t pt-6">
        <ul className="flex flex-wrap justify-center gap-x-6">
          {LEGAL_DOCS.filter((d) => d !== doc).map((d) => (
            <li key={d}>
              <Link href={`/legal/${d}`} className="flex min-h-11 items-center underline-offset-4 hover:underline">
                {t(`nav.${d}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
