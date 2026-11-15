import { CATALOGUE } from "@workspace/db/catalogue"
import { z } from "zod"

export type Lang = "fr" | "en" | "ar"

const BRAND_WORDS = ["Ceraghit Creation", "Ceraghit", "Sabri Ghit"]

/** Names and references that must come out exactly as written, in every language and script. */
export const KEEP: readonly string[] = [...BRAND_WORDS, ...CATALOGUE.map((product) => product.ref)]

/** Product references like `CER-0010` or `CG-112`. */
export const REF_PATTERN = /\b[A-Z]{2,4}-\d{2,5}\b/g

export const GLOSSARY: readonly { fr: string; en: string; ar: string }[] = [
  { fr: "grès", en: "stoneware", ar: "خزف حجري" },
  { fr: "faïence", en: "faience", ar: "فخار مزجج" },
  { fr: "porcelaine", en: "porcelain", ar: "بورسلان" },
  { fr: "émail", en: "glaze", ar: "طلاء زجاجي" },
  { fr: "engobe", en: "slip", ar: "بطانة طينية" },
  { fr: "tournage", en: "wheel-throwing", ar: "التشكيل على الدولاب" },
  { fr: "façonné à la main", en: "handmade", ar: "مشكّل يدوياً" },
  { fr: "cuisson", en: "firing", ar: "حرق" },
  { fr: "four", en: "kiln", ar: "فرن" },
  { fr: "raku", en: "raku", ar: "راكو" },
]

const LANG_NAMES: Record<Lang, string> = { fr: "French", en: "English", ar: "Arabic" }

export interface TranslateRequest {
  /** What the text is (product title, description...), so the model keeps the register. */
  field: string
  maxLength: number
  source: { lang: Lang; text: string }
  targets: Lang[]
}

export function buildTranslatePrompt({ field, maxLength, source, targets }: TranslateRequest): {
  system: string
  prompt: string
} {
  const targetNames = targets.map((lang) => `${lang} (${LANG_NAMES[lang]})`).join(", ")
  const glossary = GLOSSARY.map((term) => `- ${term.fr} = ${term.en} / ${term.ar}`).join("\n")
  const system = [
    "You are a professional e-commerce translator for Ceraghit Creation, a Tunisian handmade ceramics studio.",
    `Translate from ${LANG_NAMES[source.lang]} into: ${targetNames}.`,
    "Translate, do not rewrite: add no claims, no marketing adjectives, nothing that is not in the source.",
    `Keep these names and references exactly as written, in Latin script: ${KEEP.join(", ")}, and any reference like CER-0010.`,
    `Use this ceramics glossary (French = English / Arabic):\n${glossary}`,
    "Arabic: Modern Standard Arabic only, no Tunisian or Maghrebi dialect, no tashkeel except where a word is ambiguous, Western digits (0-9), units as written (cm, ml, °C), Latin-script names stay in Latin script.",
    `Length: within 25% of the source length in characters, same paragraphs and line breaks, never longer than ${maxLength} characters.`,
    "Plain text only: no markdown, no quotes around values, never echo the source.",
    "An empty source gives an empty output. Never invent content.",
    `Answer only with the fields ${targets.join(", ")}.`,
  ].join("\n\n")
  const prompt = `Field: ${field}\nSource (${source.lang}):\n${source.text}`
  return { system, prompt }
}

/** Strict json_schema on Groq needs every field required and no extra keys. */
export function translationSchema(targets: Lang[]) {
  return z.strictObject(Object.fromEntries(targets.map((lang) => [lang, z.string()])))
}
