export const APP_LOCALES = ["fr", "en", "ar"] as const
export type AppLocale = (typeof APP_LOCALES)[number]

/** fr is the default locale and has no prefix, en and ar do (`localePrefix: "as-needed"`). */
export function localePath(locale: AppLocale, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`
  if (locale === "fr") return clean
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`
}

/** `desktop-fr` -> `fr`. */
export function localeOfProject(project: string): AppLocale {
  const code = project.split("-").pop()
  return APP_LOCALES.find((l) => l === code) ?? "fr"
}
