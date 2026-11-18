/**
 * OpenObserve speaks OTLP over HTTP with basic auth: one endpoint per signal under the org, and the log stream in a
 * header. Same variable names as the owner's other projects, so a habit carries over.
 */
export interface OpenObserveEnv {
  OPENOBSERVE_URL?: string
  OPENOBSERVE_ORG?: string
  OPENOBSERVE_USER?: string
  OPENOBSERVE_PASSWORD?: string
  OPENOBSERVE_STREAM?: string
}

export interface OpenObserve {
  service: string
  environment: string
  traces: string
  logs: string
  metrics: string
  /** Basic auth, already base64. */
  headers: Record<string, string>
  /** Logs also name their stream here. */
  logHeaders: Record<string, string>
}

const compact = (source: Record<string, string | undefined>, key: keyof OpenObserveEnv): string | undefined => {
  const value = source[key]?.trim()
  return value ? value : undefined
}

/** Reads the five variables from any env-shaped object (the api's parsed env, or `process.env` in Next). */
export function readOpenObserveEnv(source: Record<string, string | undefined> = process.env): OpenObserveEnv {
  return {
    OPENOBSERVE_URL: compact(source, "OPENOBSERVE_URL"),
    OPENOBSERVE_ORG: compact(source, "OPENOBSERVE_ORG"),
    OPENOBSERVE_USER: compact(source, "OPENOBSERVE_USER"),
    OPENOBSERVE_PASSWORD: compact(source, "OPENOBSERVE_PASSWORD"),
    OPENOBSERVE_STREAM: compact(source, "OPENOBSERVE_STREAM"),
  }
}

/**
 * Everything needed to ship one service's telemetry, or null when the url, the user or the password is missing: no
 * configuration means no export at all, never a failed boot.
 */
export function openObserve(env: OpenObserveEnv, meta: { service: string; environment: string }): OpenObserve | null {
  const url = env.OPENOBSERVE_URL?.trim().replace(/\/$/, "")
  const user = env.OPENOBSERVE_USER?.trim()
  const password = env.OPENOBSERVE_PASSWORD?.trim()
  if (!url || !user || !password) return null
  const org = env.OPENOBSERVE_ORG?.trim() || "default"
  const stream = env.OPENOBSERVE_STREAM?.trim() || "ceraghit"
  const token = Buffer.from(`${user}:${password}`).toString("base64")
  const headers = { authorization: `Basic ${token}` }
  return {
    service: meta.service,
    environment: meta.environment,
    traces: `${url}/api/${org}/v1/traces`,
    logs: `${url}/api/${org}/v1/logs`,
    metrics: `${url}/api/${org}/v1/metrics`,
    headers,
    logHeaders: { ...headers, "stream-name": stream },
  }
}

/** The resource attributes every signal carries, so one OpenObserve filter finds a service in one environment. */
export const resourceAttributes = (config: OpenObserve) => ({
  "service.name": config.service,
  "deployment.environment": config.environment,
})
