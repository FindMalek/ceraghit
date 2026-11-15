import ar from "../messages/ar.json"
import en from "../messages/en.json"
import fr from "../messages/fr.json"

const COPY = { fr, en, ar }

export type CopyLocale = keyof typeof COPY

export const COPY_LOCALES = Object.keys(COPY) as CopyLocale[]

/** Pages that replace the root layout cannot use next-intl: pick the locale from the url prefix, then the html lang. */
export function detectLocale(pathname: string, htmlLang: string): CopyLocale {
  const known = (value: string | undefined) => COPY_LOCALES.find((locale) => locale === value)
  return known(pathname.split("/")[1]) ?? known(htmlLang) ?? "fr"
}

export function errorCopy(locale: CopyLocale) {
  return COPY[locale].error
}

export function notFoundCopy(locale: CopyLocale) {
  return COPY[locale].notFound
}
