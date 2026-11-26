import { reportError } from "@workspace/errors"
import {
  cleanupUploads,
  type JobCounts,
  purgeMailLog,
  reconcileStorage,
  releaseExpiredHolds,
  retryFailedMails,
  rolloverAiUsage,
  type Services,
  sendExpiryMails,
  storageUsage,
  sweepRateLimits,
  trackShipments,
} from "@workspace/orpc"

export interface CronJob {
  /** Idempotent: running it twice in a row changes nothing the second time. Counts only, no customer data. */
  run: (services: Services, now: Date, options: { dryRun: boolean }) => Promise<JobCounts>
}

/** Counts of one cleanup run, plus the log line; file keys only go to the log of a dry run. */
async function mediaCleanup(services: Services, now: Date, dryRun: boolean): Promise<JobCounts> {
  if (!services.storage) return { skipped: "no storage" }
  const { items, ...report } = await cleanupUploads(services.db, services.storage, { now, dryRun })
  const { dryRun: _, ...counts } = report
  console.info(
    `[cleanup] env=${services.config.deployEnv} dryRun=${dryRun} abandoned=${report.abandonedDeleted} unused=${report.unusedDeleted} freedBytes=${report.freedBytes} warned=${report.warned} errors=${report.errors}`,
  )
  if (dryRun) for (const item of items) console.info(`[cleanup] would remove ${item.reason} ${item.key} ${item.bytes}`)
  const {
    dryRun: __,
    errors: reconcileErrors,
    ...reconcile
  } = await reconcileStorage(services.db, services.storage, { now, dryRun })
  console.info(
    `[reconcile] env=${services.config.deployEnv} dryRun=${dryRun} listed=${reconcile.listed} missingRows=${reconcile.missingRows} orphansDeleted=${reconcile.orphansDeleted} rowsDropped=${reconcile.rowsDropped} sizesFixed=${reconcile.sizesFixed} drift=${reconcile.driftBytesBefore}->${reconcile.driftBytesAfter} errors=${reconcileErrors}`,
  )
  const usage = await storageUsage(services.db)
  return {
    ...counts,
    ...reconcile,
    reconcileErrors,
    usedBytes: usage.usedBytes,
    percent: usage.percent,
    dryRun: dryRun ? 1 : 0,
  }
}

/**
 * `POST /cron/<name>` runs the matching job. To add one, register it here and list it in
 * `packages/sdk/src/jobs.ts` (label, schedule, stale threshold).
 */
export const CRON_JOBS: Record<string, CronJob> = {
  "media-cleanup": {
    run: (services, now, { dryRun }) => mediaCleanup(services, now, dryRun),
  },
  /** Alias kept until the schedule moves to `media-cleanup`; also sweeps rate limits and the mail log. */
  "cleanup-uploads": {
    async run(services, now, { dryRun }) {
      const rateLimits = await sweepRateLimits(services.db, now)
      const mailsPurged = await purgeMailLog(services).catch((error) => {
        console.error("[cron] mail purge", error instanceof Error ? error.message : "failed")
        reportError(error, { tags: { job: "cleanup-uploads", step: "mail-purge" } })
        return -1
      })
      return { rateLimits, mailsPurged, ...(await mediaCleanup(services, now, dryRun)) }
    },
  },
  "release-holds": {
    async run(services, now) {
      const released = await releaseExpiredHolds(services, now)
      return { released, mailed: await sendExpiryMails(services) }
    },
  },
  "ai-usage-rollover": {
    run: (services, now) => rolloverAiUsage(services, now),
  },
  "retry-mail": {
    async run(services) {
      return await retryFailedMails(services)
    },
  },
  /** A no-op while shipping is manual or the Aramex credentials are missing. */
  "track-shipments": {
    async run(services) {
      const report = await trackShipments(services)
      return { ...report }
    },
  },
}
