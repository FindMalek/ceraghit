import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"
import fr from "../messages/fr.json"
import { routing } from "./routing"

type Messages = typeof fr

/** French is the base: a key missing from en/ar falls back to it instead of showing the key. */
function withFallback(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(over)) {
    const current = out[key]
    out[key] =
      typeof value === "object" && value !== null && typeof current === "object" && current !== null
        ? withFallback(current as Record<string, unknown>, value as Record<string, unknown>)
        : value
  }
  return out
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const messages = locale === "fr" ? fr : withFallback(fr, (await import(`../messages/${locale}.json`)).default)
  return { locale, messages: messages as Messages }
})
