import { openObserve, readOpenObserveEnv } from "@workspace/logger/openobserve"
import type { Env } from "./env"

export interface Telemetry {
  /** False when `OPENOBSERVE_*` is unset: nothing is buffered and no socket is opened. */
  enabled: boolean
  forceFlush(): Promise<void>
  /** Keeps a Vercel instance alive until the batch has left. */
  waitUntil?: (task: Promise<unknown>) => void
  shutdown(): Promise<void>
}

const off: Telemetry = { enabled: false, forceFlush: async () => {}, shutdown: async () => {} }

/**
 * Loads the SDK only when `OPENOBSERVE_*` is set: importing it costs about a third of a cold start's CPU, and it is a
 * module of ours (not the packages) because the split Vercel bundle only keeps named exports for those.
 */
export async function startTelemetry(env: Env): Promise<Telemetry> {
  if (process.env.OTEL_SDK_DISABLED === "true") return off
  const config = openObserve(readOpenObserveEnv(env as unknown as Record<string, string | undefined>), {
    service: "ceraghit-api",
    environment: env.DEPLOY_ENV,
  })
  if (!config) return off
  const { startSdk } = await import("./telemetry-sdk")
  return startSdk(config)
}

/**
 * Vercel freezes an instance as soon as the response is sent: without this the last batch never leaves. Docker (local
 * and previews) keeps the process alive against a 60s exporter, so nothing to do there.
 */
export function flushAfter<T extends (request: Request) => Promise<Response>>(telemetry: Telemetry, next: T): T {
  if (!telemetry.enabled || !process.env.VERCEL) return next
  return (async (request: Request) => {
    const response = await next(request)
    telemetry.waitUntil?.(telemetry.forceFlush())
    return response
  }) as T
}
