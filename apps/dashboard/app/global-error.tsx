"use client"

import "@workspace/ui/globals.css"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect } from "react"
import { StatusPage } from "@/components/status-page"
import { FONT_VARIABLES } from "@/lib/fonts"

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error)
  }, [error])
  return (
    <html lang="fr" className={cn(FONT_VARIABLES)}>
      <body className="min-h-svh text-[17px]">
        <StatusPage
          title="Une erreur est survenue"
          text="Un problème est survenu de notre côté. Réessayez dans un instant."
          digest={error.digest}
        >
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
            onClick={() => retry()}
          >
            Réessayer
          </button>
        </StatusPage>
      </body>
    </html>
  )
}
