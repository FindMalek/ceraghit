import { getRequestId, traceFields } from "@workspace/logger"

export { glitchtipIssues, glitchtipOrigin, resolveGlitchtip } from "./config"

export interface ReportContext {
  /** Identifiers only: a job name, an order number, a route. Never a customer's name, email, phone or address. */
  tags?: Record<string, string | number | undefined>
  level?: "warning" | "error" | "fatal"
}

type Reporter = (
  error: unknown,
  context: { tags: Record<string, string>; level: NonNullable<ReportContext["level"]> },
) => string | undefined
type Flusher = (ms: number) => Promise<unknown>

let reporter: Reporter | null = null
let flusher: Flusher | null = null

/** Called by the runtime inits once the SDK started. Without it `reportError` does nothing. */
export function setReporter(next: Reporter | null, flush: Flusher | null = null): void {
  reporter = next
  flusher = flush
}

export const errorsEnabled = (): boolean => reporter !== null

/**
 * Sends one handled failure to GlitchTip, tagged with the request id and trace id so it links to its OpenObserve logs.
 * No-op without a DSN. Returns the event id (log it next to the error line) or undefined.
 */
export function reportError(error: unknown, context: ReportContext = {}): string | undefined {
  if (!reporter) return undefined
  const tags: Record<string, string> = {}
  for (const [name, value] of Object.entries({
    request_id: getRequestId(),
    trace_id: traceFields().trace_id,
    ...context.tags,
  })) {
    if (value !== undefined && value !== "") tags[name] = String(value)
  }
  try {
    return reporter(error, { tags, level: context.level ?? "error" })
  } catch {
    return undefined
  }
}

/** Vercel freezes an instance once the response is sent, so the api awaits this after a failure. */
export async function flushErrors(ms = 2000): Promise<void> {
  await flusher?.(ms).catch(() => {})
}
