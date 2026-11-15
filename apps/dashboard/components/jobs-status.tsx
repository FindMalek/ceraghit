"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { JobStatus } from "@workspace/sdk"
import { Tone } from "@/components/status-badge"

const RELATIVE = new Intl.RelativeTimeFormat("fr", { numeric: "auto" })

function ago(minutes: number): string {
  if (minutes < 60) return RELATIVE.format(-Math.max(minutes, 0), "minute")
  if (minutes < 48 * 60) return RELATIVE.format(-Math.floor(minutes / 60), "hour")
  return RELATIVE.format(-Math.floor(minutes / 1440), "day")
}

function duration(minutes: number): string {
  return minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`
}

function Badge({ job }: { job: JobStatus }) {
  if (!job.registered && !job.lastRun) return <Tone tone="quiet">Pas encore active</Tone>
  if (!job.lastRun) return <Tone tone="quiet">Jamais lancée</Tone>
  if (job.lastRun.ok === false) return <Tone tone="bad">Échec</Tone>
  if (job.stale) return <Tone tone="warn">En retard</Tone>
  return <Tone tone="good">OK</Tone>
}

function counts(job: JobStatus): string | null {
  const entries = Object.entries(job.lastRun?.counts ?? {}).filter(([, value]) => typeof value === "number")
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(", ") : null
}

/** The last run of each scheduled job, with a warning when one has not run for longer than it should. */
export function JobsStatus() {
  const { data } = useQuery(orpc.admin.jobs.status.queryOptions({ input: {} }))
  if (!data) return null
  return (
    <section className="frame flex flex-col gap-1 bg-card/60 p-4" aria-labelledby="jobs-title">
      <h2 id="jobs-title" className="font-heading">
        Tâches planifiées
      </h2>
      <p className="text-muted-foreground text-sm">Ce qui tourne tout seul : stock réservé, photos, emails.</p>
      <ul className="mt-2 divide-y divide-border">
        {data.items.map((job) => (
          <li key={job.name} className="flex min-h-11 flex-col gap-1 py-3 md:flex-row md:items-center md:gap-4">
            <div className="flex flex-1 flex-col">
              <p>{job.label}</p>
              <p className="text-muted-foreground text-sm">{job.schedule}</p>
            </div>
            <div className="flex flex-col gap-1 md:w-80 md:items-end md:text-right">
              <div className="flex items-center gap-2">
                {job.lastRun && job.minutesSince !== null && (
                  <span className="text-sm">Dernier passage : {ago(job.minutesSince)}</span>
                )}
                <Badge job={job} />
              </div>
              {job.lastRun?.ok === false && job.lastRun.error && (
                <p className="text-destructive text-sm">{job.lastRun.error}</p>
              )}
              {job.stale && job.minutesSince !== null && (
                <p className="text-ochre text-sm">En retard : aucun passage depuis {duration(job.minutesSince)}</p>
              )}
              {counts(job) && <p className="text-muted-foreground text-xs">{counts(job)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
