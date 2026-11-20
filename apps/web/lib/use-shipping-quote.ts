"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { Currency, SHIPPING_COUNTRIES } from "@workspace/sdk"
import { useEffect, useState } from "react"

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
  return useQuery(
    orpc.public.catalog.shippingQuote.queryOptions({
      input: { items, country, currency, ...(city ? { city } : {}), ...(postalCode ? { postalCode } : {}) },
      enabled: items.length > 0,
      staleTime: 60_000,
    }),
  )
}
