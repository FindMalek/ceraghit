/**
 * Next loads this once per server instance. Everything is imported lazily so the edge build never sees a node-only
 * module: the storefront's middleware is all the edge runtime runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startServerTelemetry } = await import("./lib/telemetry")
  startServerTelemetry("ceraghit-web")
  const { startNextErrors } = await import("@workspace/errors/next")
  startNextErrors("ceraghit-web")
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { logRequestError } = await import("@workspace/logger/next")
  const requestId = logRequestError(error, request, context)
  const { reportRequestError } = await import("@workspace/errors/next")
  reportRequestError(error, request, context, requestId)
}
