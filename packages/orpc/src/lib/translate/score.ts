import { GLOSSARY, KEEP, type Lang, REF_PATTERN } from "./prompt"

/** Output length over source length, in characters. Null when the source is empty. */
export function lengthRatio(source: string, output: string): number | null {
  const base = source.trim().length
  return base === 0 ? null : output.trim().length / base
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}($|[^\\p{L}\\p{N}])`, "iu").test(text)
}

function keepTokens(source: string): string[] {
  const named = KEEP.filter((token) => source.includes(token) && hasWord(source, token))
  const refs = source.match(REF_PATTERN) ?? []
  return [...new Set([...named, ...refs])]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Share of the source's brand names and references found verbatim in the output. Null when there are none. */
export function scoreKeep(source: string, output: string): number | null {
  const tokens = keepTokens(source)
  if (tokens.length === 0) return null
  return tokens.filter((token) => output.includes(token)).length / tokens.length
}

const ALLOWED_LATIN = new Set(["cm", "mm", "ml", "cl", "kg", "g", "C", "DT", "TND", "EUR"])

export interface ArabicScriptScore {
  /** Arabic letters over all letters, KEEP names and units left out. */
  arabicShare: number
  latinWords: string[]
  easternDigits: number
  valid: boolean
}

export function scoreArabicScript(output: string): ArabicScriptScore {
  let rest = output
  for (const token of [...KEEP, ...(output.match(REF_PATTERN) ?? [])]) rest = rest.split(token).join(" ")
  const latinWords = (rest.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g) ?? []).filter((word) => !ALLOWED_LATIN.has(word))
  const letters = rest.match(/\p{L}/gu)?.length ?? 0
  const arabic = rest.match(/\p{Script=Arabic}/gu)?.length ?? 0
  const easternDigits = output.match(/[٠-٩۰-۹]/g)?.length ?? 0
  const arabicShare = letters === 0 ? 1 : arabic / letters
  return { arabicShare, latinWords, easternDigits, valid: latinWords.length === 0 && easternDigits === 0 }
}

/** Share of glossary terms in the French source rendered with the agreed word. Null when none appear. */
export function scoreGlossary(source: string, output: string, lang: Exclude<Lang, "fr">): number | null {
  const terms = GLOSSARY.filter((term) => hasWord(source, term.fr))
  if (terms.length === 0) return null
  return terms.filter((term) => output.toLowerCase().includes(term[lang].toLowerCase())).length / terms.length
}

const STOPWORDS = new Set(
  "avec dans pour sans sous vers chez entre leur leurs cette ces elle elles nous vous sont être était plus moins même tous toutes tout toute une des les aux par sur pas que qui quoi dont".split(
    " ",
  ),
)

function contentWords(text: string): Set<string> {
  const words = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/\p{L}{4,}/gu)
  return new Set((words ?? []).filter((word) => !STOPWORDS.has(word)))
}

/** Share of the original French content words recovered by the back translation. Null when there are none. */
export function roundTripSimilarity(original: string, back: string): number | null {
  const words = contentWords(original)
  if (words.size === 0) return null
  const found = contentWords(back)
  return [...words].filter((word) => found.has(word)).length / words.size
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index] ?? null
}
