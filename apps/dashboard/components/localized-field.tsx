"use client"

import { TranslateIcon } from "@phosphor-icons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { AiTranslateField } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useState } from "react"
import { errorMessage } from "@/lib/errors"
import { type LocalizedDraft, mergeTranslation } from "@/lib/localized"

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
] as const

type Language = (typeof LANGUAGES)[number]["value"]

const clone = (value: LocalizedDraft): LocalizedDraft => ({ fr: value.fr, en: value.en, ar: value.ar })

/** French is required, English and Arabic are optional tabs: a dot shows which languages are filled in. */
export function LocalizedField({
  id,
  label,
  value,
  onChange,
  multiline,
  required,
  error,
  hint,
  translateField,
}: {
  id: string
  label: string
  value: LocalizedDraft
  onChange: (value: LocalizedDraft) => void
  multiline?: boolean
  required?: boolean
  error?: string
  hint?: string
  /** When set, the field can draft its empty languages through `admin.ai.translate`. */
  translateField?: AiTranslateField
}) {
  const [language, setLanguage] = useState<Language>("fr")
  const [auto, setAuto] = useState<Set<Language>>(new Set())
  const [undo, setUndo] = useState<LocalizedDraft | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const status = useQuery({
    ...orpc.admin.ai.status.queryOptions(),
    enabled: Boolean(translateField),
    staleTime: 60_000,
  })
  const translate = useMutation(orpc.admin.ai.translate.mutationOptions())

  const set = (text: string) => {
    if (auto.has(language)) {
      const next = new Set(auto)
      next.delete(language)
      setAuto(next)
    }
    onChange({ ...value, [language]: text })
  }
  const common = {
    id,
    value: value[language],
    dir: language === "ar" ? ("rtl" as const) : ("ltr" as const),
    "aria-invalid": Boolean(error) && language === "fr",
    onChange: (event: { target: { value: string } }) => set(event.target.value),
  }

  const missing = LANGUAGES.filter((l) => !value[l.value].trim()).map((l) => l.value)
  const source = value.fr.trim() ? "fr" : (LANGUAGES.find((l) => value[l.value].trim())?.value ?? null)
  const canTranslate =
    Boolean(translateField) &&
    Boolean(status.data?.configured) &&
    !status.data?.capReached &&
    missing.length > 0 &&
    source !== null &&
    !translate.isPending

  const run = async () => {
    if (!translateField || !source) return
    setWarning(null)
    try {
      const result = await translate.mutateAsync({
        field: translateField,
        values: { fr: value.fr, en: value.en ?? "", ar: value.ar ?? "" },
      })
      const snapshot = clone(value)
      const { values, filled } = mergeTranslation(value, result.values)
      onChange(values)
      setAuto(new Set([...auto, ...filled]))
      setUndo(snapshot)
      setWarning(
        result.warnings.includes("arabic_script")
          ? "Vérifiez la traduction arabe."
          : result.warnings.includes("length")
            ? "La traduction est plus longue ou plus courte que le français, vérifiez-la."
            : null,
      )
      const first = LANGUAGES.find((l) => filled.includes(l.value))
      if (first) setLanguage(first.value)
    } catch (e) {
      showError(errorMessage(e))
    }
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>
          {label}
          {required && <span aria-hidden> *</span>}
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={language} onValueChange={(next) => setLanguage(next as Language)}>
            <TabsList>
              {LANGUAGES.map((l) => (
                <TabsTrigger
                  key={l.value}
                  value={l.value}
                  className="px-3 text-foreground/85! data-active:text-foreground!"
                >
                  {l.label}
                  {auto.has(l.value) ? (
                    <Badge variant="secondary" className="ms-1 px-1 text-[10px]">
                      auto
                    </Badge>
                  ) : (
                    value[l.value].trim() && (
                      <span aria-hidden className="ml-1 text-gold">
                        •
                      </span>
                    )
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {translateField && status.data?.configured && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!canTranslate}
              title={status.data.capReached ? "Limite mensuelle atteinte" : "Traduire les langues vides"}
              onClick={run}
            >
              {translate.isPending ? <Spinner /> : <TranslateIcon />}
              Traduire
            </Button>
          )}
        </div>
      </div>
      {multiline ? <Textarea rows={4} className="min-h-24" {...common} /> : <Input className="h-11" {...common} />}
      {warning && <FieldDescription className="text-amber-600">{warning}</FieldDescription>}
      {undo && auto.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FieldDescription>Traduction automatique, relisez avant d'enregistrer.</FieldDescription>
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => {
              onChange(undo)
              setUndo(null)
              setAuto(new Set())
              setWarning(null)
            }}
          >
            Annuler la traduction
          </Button>
        </div>
      )}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
