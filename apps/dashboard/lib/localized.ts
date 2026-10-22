export type Localized = { fr: string; en?: string; ar?: string }

export type LocalizedDraft = { fr: string; en: string; ar: string }

export const emptyLocalized = (): LocalizedDraft => ({ fr: "", en: "", ar: "" })

export const toLocalizedDraft = (value: Partial<Localized> | null | undefined): LocalizedDraft => ({
  fr: value?.fr ?? "",
  en: value?.en ?? "",
  ar: value?.ar ?? "",
})

/** Optional fields become null when nothing is typed, otherwise the schema decides whether French is missing. */
export function fromLocalizedDraft(draft: LocalizedDraft, optional: true): Localized | null
export function fromLocalizedDraft(draft: LocalizedDraft, optional?: false): Localized
export function fromLocalizedDraft(draft: LocalizedDraft, optional = false): Localized | null {
  const fr = draft.fr.trim()
  const en = draft.en.trim()
  const ar = draft.ar.trim()
  if (optional && !fr && !en && !ar) return null
  return { fr, ...(en && { en }), ...(ar && { ar }) }
}
