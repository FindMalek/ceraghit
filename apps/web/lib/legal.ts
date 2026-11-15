import type { PublicShopProfile } from "@workspace/sdk"
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
