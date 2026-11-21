"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { SHIPPING_COUNTRIES } from "@workspace/sdk"
import { useEffect, useRef, useState } from "react"
import { FormField } from "./form-field"

type Country = (typeof SHIPPING_COUNTRIES)[number]

/**
 * The delivery city, a text field with the carrier's cities as suggestions (a native datalist: it keeps the field's
 * focus, tab order and 16px size on every phone). Where the carrier has a list (Tunisia) the server only accepts one of
 * them and stores its spelling; anywhere else, and whenever the list is unavailable, any text is fine so a carrier
 * outage never blocks an order.
 */
export function CityField({
  country,
  label,
  emptyLabel,
  error,
  value,
  onChange,
}: {
  country: Country
  label: string
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
    orpc.public.catalog.shippingCities.queryOptions({
      input: { country, q: search },
      staleTime: 5 * 60_000,
      // The last list stays while the next one loads, so the suggestions never blink empty.
      placeholderData: (previous) => previous,
    }),
  )
  // The country the list on screen answers: a list kept while the next one loads is never shown for another country.
  const answered = useRef(country)
  if (cities.data && !cities.isPlaceholderData) answered.current = country
  const current = !cities.isPlaceholderData || answered.current === country
  const items = current ? (cities.data?.cities ?? []) : []
  const strict = current && cities.data?.strict === true
  const noMatch = strict && !cities.isPlaceholderData && search === value.trim() && search !== "" && items.length === 0

  return (
    <>
      <FormField
        id="city"
        label={label}
        autoComplete="address-level2"
        error={error ?? (noMatch ? emptyLabel : undefined)}
        list={strict ? "city-options" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {strict && (
        <datalist id="city-options">
          {items.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
      )}
    </>
  )
}
