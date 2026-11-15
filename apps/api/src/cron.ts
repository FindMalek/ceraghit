import {
  cleanupUploads,
  type JobCounts,
  purgeMailLog,
  releaseExpiredHolds,
  type Services,
  sweepRateLimits,
} from "@workspace/orpc"

export interface CronJob {
  /** Idempotent: running it twice in a row changes nothing the second time. Counts only, no customer data. */
  run: (services: Services, now: Date) => Promise<JobCounts>
}

/**
 * `POST /cron/<name>` runs the matching job. To add one, register it here and list it in
 * `packages/sdk/src/jobs.ts` (label, schedule, stale threshold).
 */
export const CRON_JOBS: Record<string, CronJob> = {
  "cleanup-uploads": {
    async run(services, now) {
      const rateLimits = await sweepRateLimits(services.db, now)
      const mailsPurged = await purgeMailLog(services).catch((error) => {
        console.error("[cron] mail purge", error instanceof Error ? error.message : "failed")
        return -1
      })
      const counts: JobCounts = { rateLimits, mailsPurged }
      if (!services.storage) return { ...counts, skipped: "no storage" }
      return { ...counts, ...(await cleanupUploads(services.db, services.storage, now)) }
    },
  },
  "release-holds": {
    async run(services, now) {
      return { released: await releaseExpiredHolds(services, now) }
    },
  },
}
