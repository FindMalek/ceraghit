"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { ENABLED_LOCALES, LOCALE_LABELS } from "@/lib/locales"

/** Renders nothing until a second language is enabled in lib/locales.ts. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav")
  const locale = useLocale()
  const pathname = usePathname()
  if (ENABLED_LOCALES.length < 2) return null
  return (
    <nav aria-label={t("language")} className={cn("flex gap-1", className)}>
      {ENABLED_LOCALES.map((code) => (
        <Link
          key={code}
          href={pathname}
          locale={code}
          hrefLang={code}
          aria-current={locale === code ? "true" : undefined}
          className={cn(
            "flex min-h-11 items-center px-2 text-sm md:min-h-9",
            locale === code ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LOCALE_LABELS[code]}
        </Link>
      ))}
    </nav>
  )
}
