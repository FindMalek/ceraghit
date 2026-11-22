import type { GlitchtipConfig } from "./config"
import { scrubBreadcrumb, scrubEvent } from "./scrub"

/** Options shared by the three runtimes: errors only (no traces, no replay), no default pii, everything scrubbed. */
export function baseOptions(config: GlitchtipConfig) {
  return {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sampleRate: config.sampleRate,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  }
}
