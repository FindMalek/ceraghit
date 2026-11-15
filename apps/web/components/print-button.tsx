"use client"

import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"

export function PrintButton() {
  const t = useTranslations("invoice")
  return (
    <Button className="h-11" variant="outline" onClick={() => window.print()}>
      {t("print")}
    </Button>
  )
}
