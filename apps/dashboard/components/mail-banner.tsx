"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import Link from "next/link"

/** Same query as the tab bar and the sidebar, so one resend clears all three. */
export function useFailedMails(): number {
  const stats = useQuery(orpc.admin.overview.queryOptions({ input: { days: 30 }, refetchInterval: 60_000 }))
  return stats.data?.failedMails ?? 0
}

export function MailBanner() {
  const failed = useFailedMails()
  if (failed === 0) return null
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 border-destructive/30 border-b bg-destructive/10 px-4 py-3 text-destructive text-sm md:px-6"
    >
      <span>
        {failed} email{failed > 1 ? "s" : ""} n'{failed > 1 ? "ont" : "a"} pas pu être envoyé{failed > 1 ? "s" : ""}.
      </span>
      <Link href="/emails" className="flex min-h-11 items-center font-medium underline underline-offset-4">
        Voir
      </Link>
    </div>
  )
}
