import { CLIENT_NAMES, glitchtipIssues } from "./config"
import { reportError } from "./index"
import { initNode } from "./node"

type Env = Record<string, string | undefined>

/**
 * Next server (node runtime), from `instrumentation.ts`. Refuses to boot on a mismatched GlitchTip setup, for the server
 * DSN and for the `NEXT_PUBLIC_` one the browser will use (checked here because the browser cannot see `APP_ENV`).
 * Without a DSN, or with `APP_ENV=local`, nothing starts.
 */
export function startNextErrors(service: string, env: Env = process.env): boolean {
  const issues = [...glitchtipIssues(env), ...glitchtipIssues(env, CLIENT_NAMES)]
  if (issues.length) throw new Error(`glitchtip: ${[...new Set(issues)].join("; ")}`)
  return initNode(env, service)
}

interface RequestInfo {
  path: string
  method: string
}

interface ErrorContext {
  routePath: string
  routeType: string
}

/** Next's `onRequestError`: route, route type, digest and the same request id the log line carries. No params, no query. */
export function reportRequestError(
  error: unknown,
  request: Readonly<RequestInfo>,
  context: Readonly<ErrorContext>,
  requestId: string,
): string | undefined {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : ""
  return reportError(error, {
    tags: { route: context.routePath, route_type: context.routeType, method: request.method, digest, request_id: requestId },
  })
}
