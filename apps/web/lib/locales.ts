import type { AppLocale } from "@/i18n/routing"

/** Locales visitors can pick. en and ar are wired (routes, RTL, fallbacks) but stay hidden until translated. */
export const ENABLED_LOCALES: AppLocale[] = ["fr"]

export const LOCALE_LABELS: Record<AppLocale, string> = { fr: "Français", en: "English", ar: "العربية" }
