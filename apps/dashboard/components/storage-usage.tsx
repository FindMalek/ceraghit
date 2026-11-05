"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Progress } from "@workspace/ui/components/progress"

const format = (bytes: number): string =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2).replace(".", ",")} Go` : `${Math.round(bytes / 1e6)} Mo`

/** How much of the 2,5 Go plan the photos use. Files nobody uses are removed 30 days after they stop being used. */
export function StorageUsage() {
  const { data } = useQuery(orpc.admin.uploads.usage.queryOptions())
  if (!data) return null
  const percent = Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100))
  return (
    <div className="frame flex flex-col gap-2 bg-card/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading">Stockage des photos</p>
        <p className="text-sm tabular-nums">
          {format(data.usedBytes)} sur {format(data.quotaBytes)}
        </p>
      </div>
      <Progress value={percent} aria-label="Stockage utilisé" />
      <p className="text-muted-foreground text-sm">
        {data.files} fichier{data.files > 1 ? "s" : ""}. Les photos que plus rien n'utilise sont supprimées au bout de
        30 jours.
      </p>
    </div>
  )
}
