import { z } from "zod"

export interface JobSpec {
  name: string
  /** Shown in the dashboard (French only). */
  label: string
  /** Cron pattern, read in `timezone`. */
  cron: string
  timezone: "Africa/Tunis"
  /** Human reading of `cron`. */
  schedule: string
  /** Warn when the last run is older than this. */
  staleAfterMinutes: number
}

/** Every scheduled job. A job answers on `POST /cron/<name>` once a handler is registered in `apps/api/src/cron.ts`. */
export const JOBS: JobSpec[] = [
  {
    name: "cleanup-uploads",
    label: "Nettoyage des photos",
    cron: "15 3 * * *",
    timezone: "Africa/Tunis",
    schedule: "Chaque jour à 03:15",
    staleAfterMinutes: 26 * 60,
  },
  {
    name: "media-cleanup",
    label: "Nettoyage de la médiathèque",
    cron: "30 3 * * *",
    timezone: "Africa/Tunis",
    schedule: "Chaque jour à 03:30",
    staleAfterMinutes: 26 * 60,
  },
  {
    name: "release-holds",
    label: "Libération du stock réservé",
    cron: "5 * * * *",
    timezone: "Africa/Tunis",
    schedule: "Chaque heure à :05",
    staleAfterMinutes: 2 * 60,
  },
  {
    name: "track-shipments",
    label: "Suivi des colis",
    cron: "0 */3 * * *",
    timezone: "Africa/Tunis",
    schedule: "Toutes les 3 heures",
    staleAfterMinutes: 4 * 60,
  },
  {
    name: "retry-mail",
    label: "Renvoi des emails en échec",
    cron: "*/10 * * * *",
    timezone: "Africa/Tunis",
    schedule: "Toutes les 10 minutes",
    staleAfterMinutes: 30,
  },
  {
    name: "ai-usage-rollover",
    label: "Clôture du quota IA",
    cron: "5 0 1 * *",
    timezone: "Africa/Tunis",
    schedule: "Le 1er du mois à 00:05",
    staleAfterMinutes: 32 * 24 * 60,
  },
]

/** French names for the counts a job reports; a count without a label here is not shown to the owner. */
export const JOB_COUNT_LABELS: Record<string, [one: string, other: string]> = {
  released: ["commande libérée", "commandes libérées"],
  deleted: ["photo supprimée", "photos supprimées"],
  abandonedDeleted: ["envoi abandonné supprimé", "envois abandonnés supprimés"],
  unusedDeleted: ["photo inutilisée supprimée", "photos inutilisées supprimées"],
  warned: ["photo bientôt supprimée", "photos bientôt supprimées"],
  marked: ["photo marquée inutilisée", "photos marquées inutilisées"],
  restored: ["photo restaurée", "photos restaurées"],
  rateLimits: ["limite purgée", "limites purgées"],
  mailsPurged: ["email purgé", "emails purgés"],
  updated: ["colis mis à jour", "colis mis à jour"],
  mailed: ["client prévenu", "clients prévenus"],
  sent: ["email renvoyé", "emails renvoyés"],
}

export function formatJobCount(key: string, value: number): string | null {
  const label = JOB_COUNT_LABELS[key]
  return label ? `${value} ${label[value > 1 ? 1 : 0]}` : null
}

/** A run that started this long ago without finishing was cut off (the function was killed), not still running. */
export const JOB_INTERRUPTED_AFTER_MINUTES = 15

export const jobStatusSchema = z.object({
  name: z.string(),
  label: z.string(),
  schedule: z.string(),
  /** False while no handler answers `POST /cron/<name>`: the job is listed but not active yet. */
  registered: z.boolean(),
  lastRun: z
    .object({
      startedAt: z.string(),
      finishedAt: z.string().nullable(),
      ok: z.boolean().nullable(),
      counts: z.record(z.string(), z.union([z.number(), z.string()])),
      error: z.string().nullable(),
    })
    .nullable(),
  /** The last run is older than `staleAfterMinutes`; false when it never ran. */
  stale: z.boolean(),
  /** Minutes since the last run started, null when it never ran. */
  minutesSince: z.number().int().nullable(),
})
export type JobStatus = z.infer<typeof jobStatusSchema>

export type JobRunState = "inactive" | "never" | "failed" | "interrupted" | "running" | "stale" | "ok"

/** What the owner sees for a job. A run with no outcome is "running" for a while, then it was cut off. */
export function jobRunState(job: Pick<JobStatus, "registered" | "lastRun" | "stale" | "minutesSince">): JobRunState {
  if (!job.lastRun) return job.registered ? "never" : "inactive"
  if (job.lastRun.ok === false) return "failed"
  if (job.lastRun.ok === null)
    return (job.minutesSince ?? 0) >= JOB_INTERRUPTED_AFTER_MINUTES ? "interrupted" : "running"
  return job.stale ? "stale" : "ok"
}
