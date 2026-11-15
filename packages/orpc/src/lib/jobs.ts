import { jobRuns } from "@workspace/db"
import { JOBS, type JobStatus } from "@workspace/sdk"
import { and, desc, eq, lt, sql } from "drizzle-orm"
import type { Services } from "../context"

export const JOB_RETENTION_DAYS = 90

export type JobCounts = Record<string, number | string>
export type JobOutcome = { ok: boolean; [count: string]: number | string | boolean }

/** A short message: never a stack, and nothing a provider echoed back beyond its first line. */
function describe(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown error").split("\n")[0]!.slice(0, 300)
}

/**
 * Runs one job and records it in `job_runs`. Two callers at once run it once: the lock is `pg_try_advisory_xact_lock`
 * inside a transaction that stays open for the run, which works on a direct connection and behind a transaction
 * pooler alike (a session lock would not survive the pooler handing the connection to someone else).
 */
export async function runJob(
  services: Services,
  name: string,
  run: (now: Date) => Promise<JobCounts>,
): Promise<JobOutcome> {
  const { db, now } = services
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${`cron:${name}`})) as locked`,
    )
    if (!lock?.locked) return { ok: true, skipped: "already running" }

    const startedAt = now()
    const [row] = await db.insert(jobRuns).values({ name, startedAt }).returning({ id: jobRuns.id })
    let outcome: JobOutcome
    try {
      const counts = await run(startedAt)
      await db.update(jobRuns).set({ finishedAt: now(), ok: true, counts }).where(eq(jobRuns.id, row!.id))
      outcome = { ok: true, ...counts }
    } catch (error) {
      console.error(`[cron] ${name}`, describe(error))
      await db
        .update(jobRuns)
        .set({ finishedAt: now(), ok: false, error: describe(error) })
        .where(eq(jobRuns.id, row!.id))
      outcome = { ok: false }
    }
    const before = new Date(startedAt.getTime() - JOB_RETENTION_DAYS * 864e5)
    await db.delete(jobRuns).where(and(eq(jobRuns.name, name), lt(jobRuns.startedAt, before)))
    return outcome
  })
}

/** Last run of every catalogued job. `registered` is true when a handler answers `POST /cron/<name>`. */
export async function jobStatuses(services: Services, registered: ReadonlySet<string>): Promise<JobStatus[]> {
  const { db } = services
  const now = services.now()
  const rows = await db.selectDistinctOn([jobRuns.name]).from(jobRuns).orderBy(jobRuns.name, desc(jobRuns.startedAt))
  const last = new Map(rows.map((r) => [r.name, r]))
  return JOBS.map((job) => {
    const run = last.get(job.name)
    const minutesSince = run ? Math.floor((now.getTime() - run.startedAt.getTime()) / 60_000) : null
    return {
      name: job.name,
      label: job.label,
      schedule: job.schedule,
      registered: registered.has(job.name),
      lastRun: run
        ? {
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt?.toISOString() ?? null,
            ok: run.ok,
            counts: run.counts,
            error: run.error,
          }
        : null,
      stale: minutesSince !== null && minutesSince > job.staleAfterMinutes,
      minutesSince,
    }
  })
}
