import { context, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api"
import { logger, patchConsole, resolveRequestId, withRequestId } from "@workspace/logger"
import { recordHttpRequest } from "@workspace/orpc/metrics"
import type { Env } from "./env"

/** Json in production and previews, one readable line locally, plus `service`/`env` on every line. */
export function startLogger(env: Env): void {
  logger.configure({
    level: env.LOG_LEVEL,
    pretty: env.APP_ENV === "local",
    mixin: () => ({ service: "ceraghit-api", env: env.DEPLOY_ENV }),
  })
  patchConsole(logger)
}

const ID_LIKE = /[0-9]|^[0-9a-f-]{8,}$/i

/** `route` must stay low cardinality: an order number or a file key becomes `:id`. */
export function routeTemplate(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (segment && ID_LIKE.test(segment) ? ":id" : segment))
    .join("/")
}

type Handler = (request: Request) => Promise<Response>

const tracer = () => trace.getTracer("ceraghit-api")

/**
 * Gives every request an id (the inbound `x-request-id` or a new one), continues the W3C trace the Next proxy sent,
 * logs the line when done, records `http.server.duration` and returns the id in the response header. `/health` is a
 * debug line.
 */
export function withRequestLogging(next: Handler): Handler {
  return async (request) => {
    const requestId = resolveRequestId(request.headers.get("x-request-id"))
    const { pathname } = new URL(request.url)
    const route = routeTemplate(pathname)
    const parent = propagation.extract(context.active(), request.headers as unknown as Record<string, string>)
    const span = tracer().startSpan(
      `${request.method} ${route}`,
      { kind: SpanKind.SERVER, attributes: { "http.request.method": request.method, "http.route": route } },
      parent,
    )
    const started = performance.now()
    return withRequestId(requestId, () =>
      context.with(trace.setSpan(parent, span), async () => {
        let response: Response
        try {
          response = await next(request)
        } catch (error) {
          logger.error("request failed", { method: request.method, path: pathname, route, err: error })
          recordHttpRequest({ route, status: 500, ms: performance.now() - started })
          span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : "failed" })
          span.end()
          throw error
        }
        const ms = performance.now() - started
        span.setAttribute("http.response.status_code", response.status)
        if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR })
        span.end()
        const log = pathname === "/health" ? logger.debug : logger.info
        log("request", { method: request.method, path: pathname, status: response.status, ms: Math.round(ms) })
        recordHttpRequest({ route, status: response.status, ms })
        const withId = new Response(response.body, response)
        withId.headers.set("x-request-id", requestId)
        return withId
      }),
    )
  }
}
