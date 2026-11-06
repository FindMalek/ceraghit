"use client"

import { ErrorBanner } from "@workspace/ui/components/error-banner"
import { useTranslations } from "next-intl"
import { usePathname } from "@/i18n/navigation"

export function ErrorHost() {
  const t = useTranslations("common")
  return <ErrorBanner closeLabel={t("close")} resetKey={usePathname()} />
}
