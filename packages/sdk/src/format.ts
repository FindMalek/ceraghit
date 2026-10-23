import type { Currency } from "./schemas"

/** TND is stored in millimes (1000 per dinar), EUR in cents. */
export const MINOR_UNITS: Record<Currency, number> = { TND: 1000, EUR: 100 }

export function toMinor(value: number, currency: Currency): number {
  return Math.round(value * MINOR_UNITS[currency])
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / MINOR_UNITS[currency]
}

/** 60000 TND millimes → "60 DT", 42500 → "42,5 DT"; 3400 EUR cents → "34 €". */
export function formatMoney(minor: number, currency: Currency, locale = "fr"): string {
  const value = fromMinor(minor, currency)
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-TN-u-nu-latn" : locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === "TND" ? 3 : 2,
  }).format(value)
  const symbol = currency === "EUR" ? "€" : locale === "ar" ? "د.ت" : "DT"
  const text = `${number} ${symbol}`
  // In right-to-left text the amount and its symbol must stay one left-to-right unit: isolate it (LRI ... PDI).
  return locale === "ar" ? `\u2066${text}\u2069` : text
}

/** Picks the requested language, falling back to French which is always present. */
export function pick(text: { fr: string; en?: string; ar?: string } | null | undefined, locale: string): string {
  if (!text) return ""
  const translated = locale === "en" ? text.en : locale === "ar" ? text.ar : undefined
  return translated?.trim() ? translated : text.fr
}

/** Uploaded images are stored as `s3:<key>` and served through the api or CDN; anything else is a web path. */
export function imageSrc(image: string, webOrigin = ""): string {
  if (image.startsWith("s3:")) return `/api/files/${image.slice(3)}`
  if (image.startsWith("/")) return `${webOrigin}${image}`
  return image
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** "Tunisie", "Belgique"... in the viewer's language from an ISO code. */
export function countryName(code: string, locale = "fr"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}
