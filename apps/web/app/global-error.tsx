"use client"

import "@workspace/ui/globals.css"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useState } from "react"
import { detectLocale, errorCopy } from "@/lib/error-copy"
import { FONT_VARIABLES } from "@/lib/fonts"
import { reportClientError } from "@/lib/report-error"

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale, setLocale] = useState(detectLocale("", ""))
  useEffect(() => {
    console.error("[global-error]", error)
    reportClientError(error)
    setLocale(detectLocale(window.location.pathname, document.documentElement.lang))
  }, [error])
  const copy = errorCopy(locale)
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={cn(FONT_VARIABLES)}>
      <body className="min-h-dvh text-[1.0625rem] leading-relaxed">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-24 text-center">
          <img src="/logo.webp" alt="Ceraghit" width={96} height={96} className="size-24 rounded-full" />
          <h1 className="text-4xl">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.text}</p>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
            onClick={() => retry()}
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  )
}
