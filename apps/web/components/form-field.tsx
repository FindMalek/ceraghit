import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import type { ComponentProps } from "react"

interface Props {
  id: string
  label: string
  error?: string
  hint?: string
  multiline?: boolean
}

export function FormField({
  id,
  label,
  error,
  hint,
  multiline,
  ...props
}: Props & Omit<ComponentProps<"input">, "id" | "label">) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined
  const shared = { id, name: id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className="font-heading text-sm">
        {label}
      </FieldLabel>
      {multiline ? (
        <Textarea {...shared} {...(props as ComponentProps<"textarea">)} className="min-h-28" />
      ) : (
        <Input {...shared} {...props} className="h-11" />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
