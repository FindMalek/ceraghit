"use client"

import type { Currency } from "@workspace/sdk"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@workspace/ui/components/input-group"
import { DECIMALS_OF } from "@/lib/money"

const SYMBOL: Record<Currency, string> = { TND: "DT", EUR: "€" }

/** A plain text amount ("10", "34,5") in the currency's major unit; the form converts it with `inputToMinor`. */
export function MoneyInput({
  id,
  label,
  currency,
  value,
  onChange,
  error,
  hint,
}: {
  id: string
  label: string
  currency: Currency
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-11">
        <InputGroupInput
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={currency === "TND" ? "10" : "34"}
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{SYMBOL[currency]}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{hint ?? `Jusqu'à ${DECIMALS_OF[currency]} décimales.`}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
