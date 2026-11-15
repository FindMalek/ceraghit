"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

export function PhoneListField({
  value,
  onChange,
  error,
  max = 4,
}: {
  value: string[]
  onChange: (value: string[]) => void
  error?: string
  max?: number
}) {
  const list = value.length ? value : [""]
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>Téléphones</FieldLabel>
      <div className="flex flex-col gap-2">
        {list.map((phone, index) => (
          <div key={`phone-${index}`} className="flex gap-2">
            <Input
              className="h-11 tabular-nums"
              inputMode="tel"
              aria-label={`Téléphone ${index + 1}`}
              value={phone}
              onChange={(e) => onChange(list.map((p, i) => (i === index ? e.target.value : p)))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Retirer"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        {list.length < max && (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-fit"
            onClick={() => onChange([...list, ""])}
          >
            <PlusIcon /> Ajouter un numéro
          </Button>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
    </Field>
  )
}
