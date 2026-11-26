"use client"

import { Button } from "@workspace/ui/components/button"
import { useEffect } from "react"
import { StatusPage } from "@/components/status-page"
import { reportClientError } from "@/lib/report-error"

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[error]", error)
    reportClientError(error)
  }, [error])
  return (
    <StatusPage
      title="Une erreur est survenue"
      text="Un problème est survenu de notre côté. Réessayez dans un instant."
      digest={error.digest}
    >
      <Button variant="outline" size="lg" className="h-11" onClick={() => retry()}>
        Réessayer
      </Button>
    </StatusPage>
  )
}
