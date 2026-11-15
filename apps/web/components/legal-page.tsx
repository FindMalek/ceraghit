import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { getSettings } from "@/lib/api"
import {
  fillIdentity,
  IDENTITY_TOKENS,
  type IdentityToken,
  identity,
  isDraft,
  LEGAL_DOCS,
  type LegalDoc,
  type LegalSection,
  publisherLines,
} from "@/lib/legal"

export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const [t, settings] = await Promise.all([getTranslations("legal"), getSettings()])
  const publisher = doc === "notice" ? publisherLines(settings.profile) : []
  const sections = t.raw(`docs.${doc}.sections`) as LegalSection[]
  const values = identity(settings)
  const missing = Object.fromEntries(IDENTITY_TOKENS.map((token) => [token, t(`missing.${token}`)])) as Record<
    IdentityToken,
    string
  >
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-4 text-center">
        <h1 className="text-5xl md:text-6xl">{t(`docs.${doc}.title`)}</h1>
        <div className="ornament mx-auto max-w-xs" aria-hidden>
          <span>◆</span>
        </div>
        <p className="text-muted-foreground">{t(`docs.${doc}.intro`)}</p>
      </header>

      {isDraft(doc, sections, values) && (
        <aside role="note" className="frame space-y-1 bg-card/60 p-4 text-center">
          <p className="font-heading text-gold">{t("draft")}</p>
          <p className="text-muted-foreground text-sm">{t("draftNote")}</p>
        </aside>
      )}

      <div className="space-y-8">
        {sections.map((section, index) => (
          <section key={section.title} className="space-y-3">
            <h2 className="font-heading text-2xl text-gold">{section.title}</h2>
            {index === 0 &&
              publisher.map(({ key, value }) => (
                <p key={key}>{t.rich(`publisher.${key}`, { value, v: (chunks) => <bdi>{chunks}</bdi> })}</p>
              ))}
            {section.body.map((paragraph) => (
              <p key={paragraph}>
                {fillIdentity(paragraph, values, missing).map((segment, i) =>
                  segment.token ? <bdi key={`${segment.token}-${i}`}>{segment.text}</bdi> : segment.text,
                )}
              </p>
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
