"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { SHIPPING_COUNTRIES } from "@workspace/sdk"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { useEffect, useState } from "react"
import { FormField } from "./form-field"

type Country = (typeof SHIPPING_COUNTRIES)[number]

/**
 * The delivery city. Where the carrier has a list (Tunisia) the customer picks from it; anywhere else, and whenever
 * the list is unavailable, it stays a plain text field, so a carrier outage never blocks an order. The typed text is
 * the value either way: the server checks it against the list and stores the list's own spelling.
 */
export function CityField({
  country,
  label,
  pickLabel,
  emptyLabel,
  error,
  value,
  onChange,
}: {
  country: Country
  label: string
  pickLabel: string
  emptyLabel: string
  error?: string
  value: string
  onChange: (value: string) => void
}) {
  const [search, setSearch] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value.trim()), 250)
    return () => clearTimeout(timer)
  }, [value])
  const cities = useQuery(
    orpc.public.catalog.shippingCities.queryOptions({ input: { country, q: search }, staleTime: 5 * 60_000 }),
  )
  const items = cities.data?.cities ?? []

  if (!cities.data?.strict) {
    return (
      <FormField
        id="city"
        label={label}
        autoComplete="address-level2"
        error={error}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="city" className="font-heading text-sm">
        {label}
      </FieldLabel>
      <Combobox
        items={items}
        filter={null}
        inputValue={value}
        onInputValueChange={onChange}
        onValueChange={(next) => typeof next === "string" && onChange(next)}
      >
        <ComboboxInput
          id="city"
          className="h-11"
          placeholder={pickLabel}
          autoComplete="address-level2"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "city-error" : undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                <span dir="ltr">{item}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <input type="hidden" name="city" value={value} />
      {error && <FieldError id="city-error">{error}</FieldError>}
    </Field>
  )
}
