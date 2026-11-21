import { schedules } from "@trigger.dev/sdk"
import { JOBS, type JobSpec } from "@workspace/sdk/jobs"
import { callCron } from "./call-cron"

/** The catalogue owns the pattern and the timezone, so a schedule can't drift from the dashboard's stale threshold. */
function spec(name: string): JobSpec {
  const job = JOBS.find((job) => job.name === name)
  if (!job) throw new Error(`${name} is not in packages/sdk/src/jobs.ts`)
  return job
}

/**
 * One task per job whose handler is registered in `apps/api/src/cron.ts`, never more: a task calling a missing
 * endpoint gets a 404 and aborts every run. Other lanes add their line when their endpoint ships.
 *
 * `cleanup-uploads` and not `media-cleanup`: the alias also sweeps `rate_limits` and the mail log, so moving the
 * schedule to the two-tier job is a separate change (see docs/deploy.md).
 */
const cleanupUploads = spec("cleanup-uploads")

export const cleanupUploadsTask = schedules.task({
  id: cleanupUploads.name,
  cron: { pattern: cleanupUploads.cron, timezone: cleanupUploads.timezone },
  run: () => callCron(cleanupUploads.name),
})

const releaseHolds = spec("release-holds")

export const releaseHoldsTask = schedules.task({
  id: releaseHolds.name,
  cron: { pattern: releaseHolds.cron, timezone: releaseHolds.timezone },
  run: () => callCron(releaseHolds.name),
})

const retryMail = spec("retry-mail")

export const retryMailTask = schedules.task({
  id: retryMail.name,
  cron: { pattern: retryMail.cron, timezone: retryMail.timezone },
  run: () => callCron(retryMail.name),
})

const trackShipments = spec("track-shipments")

export const trackShipmentsTask = schedules.task({
  id: trackShipments.name,
  cron: { pattern: trackShipments.cron, timezone: trackShipments.timezone },
  run: () => callCron(trackShipments.name),
})
