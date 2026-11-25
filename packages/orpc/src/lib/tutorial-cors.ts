export interface CorsInput {
  bucket: string
  /** Origin of the dashboard, the only one allowed to read the hosted tutorial videos. */
  dashboardOrigin: string
  /** Origin of the storefront, which only uploads customer photos with PUT. */
  webOrigin: string
  /** Public base url of the bucket (the CDN custom domain), used by the verify commands. */
  cdnUrl: string
  /** S3 api endpoint for the `aws s3api` form, `<ACCOUNT_ID>` stays a placeholder. */
  endpoint?: string
}

export interface CorsPlan {
  /** Body for `aws s3api put-bucket-cors --cors-configuration file://...` (R2 S3 api). */
  s3: { CORSRules: Record<string, unknown>[] }
  /** Body for `wrangler r2 bucket cors set <bucket> --file ...`. */
  wrangler: { rules: Record<string, unknown>[] }
  apply: string[]
  verify: string[]
}

const EXPOSED = ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]

function origin(value: string, label: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a url: ${value}`)
  }
  if (url.protocol !== "https:" || url.origin !== value || value.includes("*"))
    throw new Error(`${label} must be an exact https origin without path or wildcard, got ${value}`)
  return value
}

/**
 * The exact CORS rules of the production bucket: `PUT` from the storefront and the dashboard (photo uploads) and
 * `GET`/`HEAD` from the dashboard only (hosted videos). The set replaces the whole bucket configuration, so it always
 * carries both rules.
 */
export function buildCorsPlan(input: CorsInput): CorsPlan {
  const dashboard = origin(input.dashboardOrigin, "dashboard origin")
  const web = origin(input.webOrigin, "web origin")
  const cdn = input.cdnUrl.replace(/\/$/, "")
  const endpoint = input.endpoint ?? "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
  const put = [...new Set([web, dashboard])]
  const s3 = {
    CORSRules: [
      { AllowedOrigins: put, AllowedMethods: ["PUT"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 },
      {
        AllowedOrigins: [dashboard],
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["range"],
        ExposeHeaders: EXPOSED,
        MaxAgeSeconds: 3600,
      },
    ],
  }
  const wrangler = {
    rules: [
      { allowed: { origins: put, methods: ["PUT"], headers: ["content-type"] }, maxAgeSeconds: 3600 },
      {
        allowed: { origins: [dashboard], methods: ["GET", "HEAD"], headers: ["range"] },
        exposeHeaders: EXPOSED,
        maxAgeSeconds: 3600,
      },
    ],
  }
  const probe = `${cdn}/tutorials/manifest.json`
  return {
    s3,
    wrangler,
    apply: [
      `wrangler r2 bucket cors list ${input.bucket}   # FIRST: run it and keep the output, set replaces everything`,
      `pnpm -s tutorials:cors --format wrangler > /tmp/cors.wrangler.json && wrangler r2 bucket cors set ${input.bucket} --file /tmp/cors.wrangler.json`,
      `pnpm -s tutorials:cors --format s3 > /tmp/cors.s3.json && aws s3api put-bucket-cors --bucket ${input.bucket} --endpoint-url ${endpoint} --cors-configuration file:///tmp/cors.s3.json`,
    ],
    verify: [
      `curl -sI -H "Origin: ${dashboard}" -H "Range: bytes=0-1" ${probe} | grep -i '^access-control-allow-origin'   # must print: access-control-allow-origin: ${dashboard}`,
      `curl -sI -H "Origin: https://evil.example" ${probe} | grep -ci '^access-control-allow-origin'   # must print 0`,
      `curl -sI -H "Origin: ${web}" ${probe} | grep -ci '^access-control-allow-origin'   # must print 0 (the storefront only uploads)`,
    ],
  }
}

export interface CorsCheck {
  name: string
  ok: boolean
  detail: string
}

/** Runs `curl` with these args and returns the response headers (read-only requests only). */
export type CurlRunner = (args: string[]) => string

function headerValue(headers: string, name: string): string | null {
  const line = headers.split(/\r?\n/).find((l) => l.toLowerCase().startsWith(`${name}:`))
  return line ? line.slice(name.length + 1).trim() : null
}

/** Read-only probes of what the CDN answers a browser: the dashboard can read, the foreign origin cannot. */
export function runCorsChecks(input: CorsInput, curl: CurlRunner): CorsCheck[] {
  const dashboard = origin(input.dashboardOrigin, "dashboard origin")
  const web = origin(input.webOrigin, "web origin")
  const url = `${input.cdnUrl.replace(/\/$/, "")}/`
  const allow = (headers: string) => headerValue(headers, "access-control-allow-origin")
  const checks: CorsCheck[] = []
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail })

  const get = curl(["-s", "-D", "-", "-o", "/dev/null", "-H", `Origin: ${dashboard}`, "-H", "Range: bytes=0-1", url])
  add("dashboard GET with Range", allow(get) === dashboard, `access-control-allow-origin: ${allow(get) ?? "(none)"}`)
  const head = curl(["-sI", "-H", `Origin: ${dashboard}`, url])
  add("dashboard HEAD", allow(head) === dashboard, `access-control-allow-origin: ${allow(head) ?? "(none)"}`)
  const pre = curl([
    "-s",
    "-D",
    "-",
    "-o",
    "/dev/null",
    "-X",
    "OPTIONS",
    "-H",
    `Origin: ${dashboard}`,
    "-H",
    "Access-Control-Request-Method: GET",
    "-H",
    "Access-Control-Request-Headers: range",
    url,
  ])
  const methods = headerValue(pre, "access-control-allow-methods") ?? ""
  const headers = headerValue(pre, "access-control-allow-headers") ?? ""
  add(
    "dashboard preflight GET with Range",
    allow(pre) === dashboard && /GET/i.test(methods) && /range/i.test(headers),
    `origin ${allow(pre) ?? "(none)"}, methods ${methods || "(none)"}, headers ${headers || "(none)"}`,
  )
  const evil = curl(["-sI", "-H", "Origin: https://evil.example", url])
  add("foreign origin refused", allow(evil) === null, `access-control-allow-origin: ${allow(evil) ?? "(none)"}`)
  const webGet = curl(["-sI", "-H", `Origin: ${web}`, url])
  add("web origin (info only, uploads need PUT)", true, `access-control-allow-origin: ${allow(webGet) ?? "(none)"}`)
  return checks
}
