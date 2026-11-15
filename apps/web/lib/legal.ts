import type { PublicSettings, PublicShopProfile } from "@workspace/sdk"
import { clean, formatAddress, shopName } from "./profile"

export const LEGAL_DOCS = ["terms", "shipping", "notice", "privacy"] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value)
}

export interface LegalSection {
  title: string
  body: string[]
}

export type PublisherLine = "company" | "form" | "address" | "taxId"

/** The "Éditeur du site" lines the owner has filled in, in display order; empty values are left out. */
export function publisherLines(profile: PublicShopProfile): { key: PublisherLine; value: string }[] {
  const lines: [PublisherLine, string | null][] = [
    ["company", clean(profile.legalName) ?? shopName(profile)],
    ["form", clean(profile.legalForm)],
    ["address", formatAddress(profile)],
    ["taxId", clean(profile.taxId)],
  ]
  return lines.flatMap(([key, value]) => (value ? [{ key, value }] : []))
}

export const IDENTITY_TOKENS = ["company", "address", "taxId", "contact"] as const
export type IdentityToken = (typeof IDENTITY_TOKENS)[number]
export type Identity = Record<IdentityToken, string | null>

/** What `{company}`, `{address}`, `{taxId}` and `{contact}` stand for in the legal texts; null while the owner has not filled it in. */
export function identity(settings: Pick<PublicSettings, "profile" | "contactEmail" | "phones">): Identity {
  const { profile } = settings
  return {
    company: clean(profile.legalName),
    address: formatAddress(profile),
    taxId: clean(profile.taxId),
    contact: [clean(settings.contactEmail), ...settings.phones.map(clean)].filter(Boolean).join(" · ") || null,
  }
}

export interface Segment {
  text: string
  /** Set on the parts that come from the profile, so they can be isolated for right-to-left text. */
  token?: IdentityToken
}

const TOKEN = new RegExp(`\\{(${IDENTITY_TOKENS.join("|")})\\}`)

/** Splits a legal paragraph around its identity tokens; an empty profile field shows `missing[token]`. */
export function fillIdentity(text: string, values: Identity, missing: Record<IdentityToken, string>): Segment[] {
  return text
    .split(TOKEN)
    .map((part, index): Segment => {
      if (index % 2 === 0) return { text: part }
      const token = part as IdentityToken
      return { text: values[token] ?? missing[token], token }
    })
    .filter((segment) => segment.text)
}

const BRACKET = /\[[^\]]*\]/

/**
 * A page is a draft while a bracketed passage is left in its text or a profile field it quotes is empty.
 * The legal notice always needs the full identity, its publisher lines come from code, not from the text.
 */
export function isDraft(doc: LegalDoc, sections: LegalSection[], values: Identity): boolean {
  const texts = sections.flatMap((section) => [section.title, ...section.body])
  if (texts.some((text) => BRACKET.test(text))) return true
  const used = new Set<IdentityToken>(doc === "notice" ? IDENTITY_TOKENS : [])
  for (const text of texts) for (const token of IDENTITY_TOKENS) if (text.includes(`{${token}}`)) used.add(token)
  return [...used].some((token) => !values[token])
}
