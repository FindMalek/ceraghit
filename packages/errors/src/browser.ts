import * as Sentry from "@sentry/browser"
import { CLIENT_NAMES, resolveGlitchtip } from "./config"
import { baseOptions } from "./options"

export interface BrowserEnv {
  dsn: string | undefined
  environment: string | undefined
  release: string | undefined
}

/**
 * Starts the browser SDK from `instrumentation-client.ts`. The `NEXT_PUBLIC_*` values are inlined at build time, so the
 * caller passes them in. Does nothing without a DSN or with an environment other than preview and production. Errors
 * only: no breadcrumbs of clicks, console or requests, no replay, no tracing.
 */
export function initBrowser(input: BrowserEnv): boolean {
  const config = resolveGlitchtip(
    {
      NEXT_PUBLIC_GLITCHTIP_DSN: input.dsn,
      NEXT_PUBLIC_GLITCHTIP_ENV: input.environment,
      NEXT_PUBLIC_GLITCHTIP_RELEASE: input.release,
      APP_ENV: input.environment,
    },
    CLIENT_NAMES,
  )
  if (!config) return false
  Sentry.init({
    ...baseOptions(config),
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.httpContextIntegration(),
    ],
  })
  return true
}

export const captureBrowserError = (error: unknown): string => Sentry.captureException(error)
