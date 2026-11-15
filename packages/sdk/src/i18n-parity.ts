import { IntlMessageFormat } from "intl-messageformat"

export type ParityBand = { min: number; max: number }

export const PARITY_BANDS: Record<"en" | "ar", ParityBand> = {
  en: { min: 0.55, max: 1.5 },
  ar: { min: 0.45, max: 1.5 },
}

/** Short labels ("E-mail" vs "البريد الإلكتروني") swing the ratio a lot for a few characters. */
export const PARITY_SLACK_CHARS = 8

export function lengthParity(fr: string, other: string, band: ParityBand): { ok: boolean; ratio: number } {
  const ratio = fr.length === 0 ? (other.length === 0 ? 1 : Number.POSITIVE_INFINITY) : other.length / fr.length
  const inBand = ratio >= band.min && ratio <= band.max
  return { ok: inBand || Math.abs(other.length - fr.length) <= PARITY_SLACK_CHARS, ratio }
}

type Element = ReturnType<IntlMessageFormat["getAst"]>[number]
type SampleValue = string | number | ((chunks: unknown[]) => string)

function sampleValues(elements: Element[], out: Record<string, SampleValue>): Record<string, SampleValue> {
  for (const el of elements) {
    if (!("value" in el) || typeof el.value !== "string" || el.type === 0) continue
    if (el.type === 8) {
      out[el.value] = (chunks) => chunks.join("")
      sampleValues(el.children, out)
      continue
    }
    out[el.value] = el.type === 6 || el.type === 2 ? 2 : el.type === 3 || el.type === 4 ? 0 : "x"
    if ("options" in el) for (const option of Object.values(el.options)) sampleValues(option.value, out)
  }
  return out
}

/** What a visitor reads: the ICU message rendered with `count: 2`, other arguments as "x", tags unwrapped. */
export function visibleText(message: string, locale: string): string {
  const format = new IntlMessageFormat(message, locale)
  const rendered = format.format(sampleValues(format.getAst(), {}))
  return Array.isArray(rendered) ? rendered.join("") : String(rendered)
}
