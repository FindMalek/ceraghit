import { logger, parseLevel, patchConsole, resolveRequestId } from "./index"
import { openObserve, readOpenObserveEnv } from "./openobserve"

export interface ServerLoggerOptions {
  service: string
  /** `local`, `pr-<n>`, `staging` or `production`. */
  environment: string
  level?: string
}

/**
 * Node runtime only (see `instrumentation.ts`): server logs from pages and route handlers become structured lines.
 * Returns the OpenObserve config the caller hands to `registerOTel`, or null when telemetry is off.
 */
export function registerLogger(options: ServerLoggerOptions, env = process.env) {
  logger.configure({
    level: parseLevel(options.level),
    pretty: env.NODE_ENV !== "production",
    mixin: () => ({ service: options.service, env: options.environment }),
  })
  patchConsole(logger)
  const config = openObserve(readOpenObserveEnv(env), options)
  if (config) logger.info("telemetry on", { endpoint: config.traces })
  return config
}

interface RequestInfo {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
}

interface ErrorContext {
  routePath: string
  routeType: string
}

/** Next's `onRequestError`: a failed render or route handler, with the route it happened in and no params. */
export function logRequestError(
  error: unknown,
  request: Readonly<RequestInfo>,
  context: Readonly<ErrorContext>,
): string {
  const requestId = resolveRequestId(inboundId(request.headers))
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : null
  logger.error("request failed", {
    err: error,
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    request_id: requestId,
  })
  return requestId
}

function inboundId(headers: RequestInfo["headers"]): string | undefined {
  const value = headers["x-request-id"]
  return Array.isArray(value) ? value[0] : value
}
