"use client"

import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useState } from "react"
import type { LocalizedDraft } from "@/lib/localized"

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
] as const

type Language = (typeof LANGUAGES)[number]["value"]

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
}: {
  id: string
  label: string
  value: LocalizedDraft
  onChange: (value: LocalizedDraft) => void
  multiline?: boolean
  required?: boolean
  error?: string
  hint?: string
}) {
  const [language, setLanguage] = useState<Language>("fr")
  const set = (text: string) => onChange({ ...value, [language]: text })
  const common = {
    id,
    value: value[language],
    dir: language === "ar" ? ("rtl" as const) : ("ltr" as const),
    "aria-invalid": Boolean(error) && language === "fr",
    onChange: (event: { target: { value: string } }) => set(event.target.value),
  }
  return (
    <Field data-invalid={Boolean(error)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>
          {label}
          {required && <span aria-hidden> *</span>}
        </FieldLabel>
        <Tabs value={language} onValueChange={(next) => setLanguage(next as Language)}>
          <TabsList>
            {LANGUAGES.map((l) => (
              <TabsTrigger key={l.value} value={l.value} className="px-3">
                {l.label}
                {value[l.value].trim() && (
                  <span aria-hidden className="ml-1 text-gold">
                    •
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {multiline ? <Textarea rows={4} className="min-h-24" {...common} /> : <Input className="h-11" {...common} />}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
