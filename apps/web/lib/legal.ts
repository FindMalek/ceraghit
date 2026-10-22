export const LEGAL_DOCS = ["terms", "shipping", "notice", "privacy"] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value)
}

export interface LegalSection {
  title: string
  body: string[]
}
