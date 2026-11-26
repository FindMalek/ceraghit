export type CspApp = "web" | "dashboard"
export type CspEnv = "local" | "preview" | "production"

export interface CspOptions {
  app: CspApp
  nonce: string
  appEnv: CspEnv
  /** `next dev` needs eval and a websocket for hot reload. */
  dev?: boolean
  /** Bucket the browser uploads to with a presigned PUT, and that signed image urls point at. */
  s3Endpoint?: string
  /** CDN in front of the bucket (R2 custom domain). */
  s3PublicUrl?: string
  /** The storefront: the dashboard shows its static catalogue photos. */
  webUrl?: string
}

export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com"
export const YOUTUBE_THUMBNAIL_ORIGIN = "https://i.ytimg.com"

export const HSTS = "max-age=63072000; includeSubDomains; preload"

export function originOf(value?: string): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function createNonce(): string {
  return btoa(crypto.randomUUID())
}

/**
 * Nonce based policy for the Next apps: scripts only run when they carry the request's nonce (strict-dynamic lets those
 * load the rest). Hosts come from env at runtime, nothing about previews or the CDN is hardcoded.
 */
export function buildCsp(options: CspOptions): string {
  const { app, nonce, appEnv, dev = false } = options
  const uploadHost = originOf(options.s3Endpoint)
  const buckets = [...new Set([uploadHost, originOf(options.s3PublicUrl)].filter(Boolean))] as string[]
  const storefront = options.app === "dashboard" ? originOf(options.webUrl) : null
  const dashboard = app === "dashboard"
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Wasm: the dashboard compiles the invoice pdf renderer, and both apps compile the WebP encoder (Safari upload fallback).
      "'wasm-unsafe-eval'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...buckets,
      ...(storefront ? [storefront] : []),
      ...(dashboard ? [YOUTUBE_THUMBNAIL_ORIGIN] : []),
    ],
    "font-src": ["'self'"],
    // Tutorial videos and their caption tracks: /api/files redirects to the bucket or CDN, which must be allowed here.
    "media-src": ["'self'", ...(dashboard ? buckets : [])],
    "connect-src": [
      "'self'",
      ...(dashboard ? ["data:"] : []),
      ...(uploadHost ? [uploadHost] : []),
      ...(dev ? ["ws:", "wss:"] : []),
    ],
    "frame-src": dashboard ? [YOUTUBE_EMBED_ORIGIN] : ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  }
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`)
  if (appEnv !== "local") parts.push("upgrade-insecure-requests")
  return parts.join("; ")
}

export function securityHeaders(options: CspOptions & { reportOnly?: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    [options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"]: buildCsp(options),
    "Cross-Origin-Opener-Policy": "same-origin",
  }
  if (options.appEnv === "production") headers["Strict-Transport-Security"] = HSTS
  return headers
}

/** What a Next proxy needs for one request: headers for the render (so Next finds the nonce) and for the response. */
export function securityFromEnv(app: CspApp, env: Record<string, string | undefined> = process.env) {
  const nonce = createNonce()
  const appEnv: CspEnv = env.APP_ENV === "production" || env.APP_ENV === "preview" ? env.APP_ENV : "local"
  const response = securityHeaders({
    app,
    nonce,
    appEnv,
    dev: env.NODE_ENV === "development",
    s3Endpoint: env.S3_ENDPOINT,
    s3PublicUrl: env.S3_PUBLIC_URL,
    webUrl: env.WEB_URL,
    reportOnly: env.CSP_REPORT_ONLY === "true",
  })
  const policy = Object.entries(response).find(([name]) => name.startsWith("Content-Security-Policy"))?.[1] ?? ""
  return { response, request: { "content-security-policy": policy, "x-nonce": nonce } }
}
