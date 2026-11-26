import * as Sentry from "@sentry/node"
import { resolveGlitchtip } from "./config"
import { setReporter } from "./index"
import { baseOptions } from "./options"

/** Starts GlitchTip on a node server: the api (it runs on Bun and on Vercel node alike) and the Next apps (node runtime only, from `instrumentation.ts`). Returns false and does nothing without `GLITCHTIP_DSN`, on `APP_ENV=local` or on a refused setup. The SDK registers no OpenTelemetry provider by default, so the OpenObserve pipeline is untouched, and only handlers that report errors are installed: no http, console or database instrumentation. */
export function initNode(env: Record<string, string | undefined>, service: string): boolean {
  const config = resolveGlitchtip(env)
  if (!config) return false
  Sentry.init({
    ...baseOptions(config),
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    initialScope: { tags: { service } },
  })
  setReporter(
    (error, { tags, level }) =>
      Sentry.withScope((scope) => {
        scope.setTags(tags)
        scope.setLevel(level)
        return Sentry.captureException(error)
      }),
    (ms) => Sentry.flush(ms),
  )
  return true
}
