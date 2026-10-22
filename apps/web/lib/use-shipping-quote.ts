"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { Currency, SHIPPING_COUNTRIES } from "@workspace/sdk"

type Country = (typeof SHIPPING_COUNTRIES)[number]

export function useShippingQuote(
  items: { productId: string; quantity: number }[],
  country: Country,
  currency: Currency,
) {
  return useQuery(
    orpc.public.catalog.shippingQuote.queryOptions({
      input: { items, country, currency },
      enabled: items.length > 0,
      staleTime: 60_000,
    }),
  )
}
