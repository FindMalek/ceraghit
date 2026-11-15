import { expect, test } from "bun:test"
import type { PublicSettings } from "@workspace/sdk"
import {
  fillIdentity,
  IDENTITY_TOKENS,
  type Identity,
  identity,
  isDraft,
  LEGAL_DOCS,
  type LegalSection,
} from "../lib/legal"
import { FALLBACK_SETTINGS } from "../lib/settings"
import ar from "../messages/ar.json"
import en from "../messages/en.json"
import fr from "../messages/fr.json"

const MISSING = { company: "[nom]", address: "[adresse]", taxId: "[mf]", contact: "[contact]" }

const COMPLETE: PublicSettings = {
  ...FALLBACK_SETTINGS,
  profile: {
    ...FALLBACK_SETTINGS.profile,
    legalName: "Atelier Demo SARL",
    address: "12 rue des Potiers",
    postalCode: "1000",
    city: "Tunis",
    taxId: "1234567/A/M/000",
  },
}

const page = (...body: string[]): LegalSection[] => [{ title: "1. Objet", body }]
const locales = { fr, en, ar } as const
const docSections = (lang: keyof typeof locales, doc: (typeof LEGAL_DOCS)[number]) =>
  locales[lang].legal.docs[doc].sections as LegalSection[]

test("identity tokens come from the profile and fall back to a visible placeholder", () => {
  const values = identity(COMPLETE)
  expect(fillIdentity("Vendeur : {company}, {address}.", values, MISSING)).toEqual([
    { text: "Vendeur : " },
    { text: "Atelier Demo SARL", token: "company" },
    { text: ", " },
    { text: "12 rue des Potiers, 1000 Tunis", token: "address" },
    { text: "." },
  ])
  const empty = identity({ ...COMPLETE, profile: { ...COMPLETE.profile, taxId: "  " } })
  expect(fillIdentity("MF {taxId}", empty, MISSING).at(-1)).toEqual({ text: "[mf]", token: "taxId" })
})

test("a page is a draft while a bracket or an empty profile field remains", () => {
  const full = identity(COMPLETE)
  expect(isDraft("terms", page("Prix {taxId}."), full)).toBe(false)
  expect(isDraft("terms", page("Délai : [à confirmer]."), full)).toBe(true)
  expect(isDraft("terms", page("Prix {taxId}."), { ...full, taxId: null })).toBe(true)
  expect(isDraft("terms", page("Aucun jeton."), { ...full, taxId: null })).toBe(false)
  expect(isDraft("notice", page("Aucun jeton."), { ...full, address: null })).toBe(true)
})

for (const doc of LEGAL_DOCS) {
  test(`${doc} has the same sections, brackets and identity tokens in fr, en and ar`, () => {
    const shape = (lang: keyof typeof locales) =>
      docSections(lang, doc).map((section) => {
        const text = [section.title, ...section.body].join(" ")
        return {
          paragraphs: section.body.length,
          brackets: (text.match(/\[/g) ?? []).length,
          tokens: IDENTITY_TOKENS.filter((token) => text.includes(`{${token}}`)),
        }
      })
    expect(shape("en")).toEqual(shape("fr"))
    expect(shape("ar")).toEqual(shape("fr"))
  })
}

test("the notice and the privacy page are final once the profile is complete", () => {
  const values: Identity = identity(COMPLETE)
  for (const lang of ["fr", "en", "ar"] as const) {
    for (const doc of ["notice", "privacy"] as const) {
      expect([lang, doc, isDraft(doc, docSections(lang, doc), values)]).toEqual([lang, doc, false])
    }
  }
})
