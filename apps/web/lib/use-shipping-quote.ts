"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { Currency, SHIPPING_COUNTRIES } from "@workspace/sdk"
import { useEffect, useRef, useState } from "react"

type Country = (typeof SHIPPING_COUNTRIES)[number]

/** The value a moment after the last change, so typing an address does not ask for a price per keystroke. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

export function useShippingQuote(
  items: { productId: string; variantId?: string; quantity: number }[],
  country: Country,
  currency: Currency,
  place: { city?: string; postalCode?: string } = {},
) {
  const city = useSettled(place.city?.trim() ?? "", 600)
  const postalCode = useSettled(place.postalCode?.trim() ?? "", 600)
  // What the answer on screen is an answer to, apart from the address: cart, country and currency.
  const question = JSON.stringify({ items, country, currency })
  const answered = useRef(question)
  const query = useQuery(
    orpc.public.catalog.shippingQuote.queryOptions({
      input: { items, country, currency, ...(city ? { city } : {}), ...(postalCode ? { postalCode } : {}) },
      enabled: items.length > 0,
      staleTime: 60_000,
      // A new city is a new question, but the last answer stays on screen until the new one arrives. Never across a
      // change of cart, country or currency: that amount would be shown in the wrong currency.
      placeholderData: (previous) => (answered.current === question ? previous : undefined),
    }),
  )
  useEffect(() => {
    if (query.data && !query.isPlaceholderData) answered.current = question
  }, [query.data, query.isPlaceholderData, question])
  return query
}
