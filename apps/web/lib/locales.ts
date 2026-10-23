import type { AppLocale } from "@/i18n/routing"

/** Locales visitors can pick: the switcher, hreflang alternates and the sitemap follow this list. */
export const ENABLED_LOCALES: AppLocale[] = ["fr", "en", "ar"]

export const LOCALE_LABELS: Record<AppLocale, string> = { fr: "Français", en: "English", ar: "العربية" }
