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
