"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { StudioSettings } from "@workspace/sdk"
import { FALLBACK_SETTINGS } from "./settings"

export function useSettings(): StudioSettings {
  const { data } = useQuery(orpc.public.catalog.settings.queryOptions({ staleTime: 5 * 60_000 }))
  return data ?? FALLBACK_SETTINGS
}
