"use client"

import { ErrorBanner } from "@workspace/ui/components/error-banner"
import { usePathname } from "next/navigation"

export function ErrorHost() {
  return <ErrorBanner closeLabel="Fermer" resetKey={usePathname()} />
}
