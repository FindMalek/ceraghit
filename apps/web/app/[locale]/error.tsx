"use client"

import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("error")
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("text")}</p>
      <Button variant="outline" size="lg" className="h-11" onClick={reset}>
        {t("retry")}
      </Button>
    </section>
  )
}
