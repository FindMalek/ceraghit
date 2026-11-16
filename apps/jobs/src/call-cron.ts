import { AbortTaskRunError } from "@trigger.dev/sdk"

/** Well under the api's function limit: a job that runs longer answers 504 and this retries. */
const TIMEOUT_MS = 240_000

/**
 * Calls `POST /cron/<name>` on the api, which owns the job and records the run in `job_runs`: this only makes sure the
 * schedule fired. Every job is idempotent, so a retry is safe; a wrong secret or an unknown name would answer the same
 * way on every attempt, so it aborts instead of retrying.
 */
export async function callCron(name: string): Promise<Record<string, number | string | boolean>> {
  const apiUrl = process.env.CERAGHIT_API_URL?.replace(/\/+$/, "")
  const secret = process.env.CRON_SECRET
  if (!apiUrl || !secret)
    throw new AbortTaskRunError("CERAGHIT_API_URL and CRON_SECRET must be set for this environment")

  const url = `${apiUrl}/cron/${name}`
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Error(`POST ${url} failed: ${error instanceof Error ? error.message : "network error"}`)
  })

  if (response.status === 401 || response.status === 404) {
    throw new AbortTaskRunError(
      `POST ${url} answered ${response.status}: check CERAGHIT_API_URL, CRON_SECRET and that the handler is registered`,
    )
  }
  if (!response.ok) throw new Error(`POST ${url} answered ${response.status}`)

  return (await response.json()) as Record<string, number | string | boolean>
}
