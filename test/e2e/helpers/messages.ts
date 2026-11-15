import { readFileSync } from "node:fs"
import { E2E } from "../env"
import type { AppLocale } from "./locale"

const cache = new Map<AppLocale, Record<string, unknown>>()

/** Storefront copy for a locale, read from the same JSON the app ships, so specs never hardcode translations. */
export function t(locale: AppLocale, key: string): string {
  let messages = cache.get(locale)
  if (!messages) {
    messages = JSON.parse(readFileSync(`${E2E.repoRoot}apps/web/messages/${locale}.json`, "utf8")) as Record<
      string,
      unknown
    >
    cache.set(locale, messages)
  }
  let node: unknown = messages
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part]
  if (typeof node !== "string") throw new Error(`missing message ${locale}.${key}`)
  return node
}

/** `t` for messages with simple `{name}` placeholders. Plurals are not handled: assert counts from the DOM instead. */
export function tv(locale: AppLocale, key: string, vars: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]))
}
