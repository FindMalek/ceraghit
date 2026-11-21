"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"

const format = (bytes: number): string =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2).replace(".", ",")} Go` : `${Math.round(bytes / 1e6)} Mo`

export const STORAGE_FULL_MESSAGE = "Le stockage est plein. Supprimez des photos inutilisées pour pouvoir en ajouter."

/** The usage query, shared by the meter and by every upload zone that has to stop when the plan is full. */
export function useStorageUsage() {
  return useQuery(orpc.admin.uploads.usage.queryOptions())
}

const BAR = {
  ok: "",
  warn: "[&_[data-slot=progress-indicator]]:bg-ochre",
  full: "[&_[data-slot=progress-indicator]]:bg-destructive",
} as const

/** How much of the 2,5 Go plan the photos use. `compact` is one line with a thin bar, for the gallery and toolbars. */
export function StorageUsage({ variant = "card" }: { variant?: "card" | "compact" }) {
  const { data } = useStorageUsage()
  if (!data) return null
  const percent = Math.min(100, data.percent)
  const message =
    data.level === "full"
      ? STORAGE_FULL_MESSAGE
      : data.level === "warn"
        ? `Le stockage est presque plein (${data.percent} %). Supprimez les photos inutilisées dans la Médiathèque.`
        : null
  const alert = message && (
    <p role={data.level === "full" ? "alert" : "status"} className="text-sm">
      {message}
      {data.level === "warn" && (
        <>
          {" "}
          <Link href="/media?unused=1" className="underline underline-offset-4">
            Voir les photos inutilisées
          </Link>
        </>
      )}
    </p>
  )
  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Progress
            value={percent}
            className={cn("h-2 w-24", BAR[data.level])}
            aria-label={`Stockage utilisé, ${data.percent} %`}
          />
          <span className="tabular-nums">
            {format(data.usedBytes)} / {format(data.quotaBytes)}
          </span>
        </div>
        {alert}
      </div>
    )
  }
  return (
    <div className="frame flex flex-col gap-2 bg-card/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading">Stockage des photos</p>
        <p className="text-sm tabular-nums">
          {format(data.usedBytes)} sur {format(data.quotaBytes)}
        </p>
      </div>
      <Progress value={percent} className={BAR[data.level]} aria-label={`Stockage utilisé, ${data.percent} %`} />
      {alert}
      <p className="text-muted-foreground text-sm">
        {data.files} fichier{data.files > 1 ? "s" : ""}. Les photos inutilisées sont supprimées après 30 jours sans
        usage, les envois abandonnés après 48 h.
      </p>
    </div>
  )
}
