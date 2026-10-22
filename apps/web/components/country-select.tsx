"use client"

import { countryName, SHIPPING_COUNTRIES } from "@workspace/sdk"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale } from "next-intl"
import { useMemo } from "react"

type Country = (typeof SHIPPING_COUNTRIES)[number]

/** A native select: the fastest and most accessible picker on a phone, and 40 countries is a long list. */
export function CountrySelect({
  id,
  label,
  value,
  onChange,
  className,
  autoComplete,
}: {
  id: string
  label: string
  value: Country
  onChange: (country: Country) => void
  className?: string
  autoComplete?: string
}) {
  const locale = useLocale()
  const options = useMemo(() => {
    const named = SHIPPING_COUNTRIES.filter((c) => c !== "TN").map((code) => ({
      code,
      name: countryName(code, locale),
    }))
    named.sort((a, b) => a.name.localeCompare(b.name, locale))
    return [{ code: "TN" as const, name: countryName("TN", locale) }, ...named]
  }, [locale])

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-heading text-sm">
        {label}
      </FieldLabel>
      <select
        id={id}
        name={id}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value as Country)}
        className={cn(
          "h-11 w-full rounded-md border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code} className="bg-card">
            {option.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
