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
      { AllowedOrigins: [dashboard], AllowedMethods: ["GET", "HEAD"], MaxAgeSeconds: 3600 },
    ],
  }
  const wrangler = {
    rules: [
      { allowed: { origins: put, methods: ["PUT"], headers: ["content-type"] }, maxAgeSeconds: 3600 },
      { allowed: { origins: [dashboard], methods: ["GET", "HEAD"] }, maxAgeSeconds: 3600 },
    ],
  }
  const probe = `${cdn}/tutorials/manifest.json`
  return {
    s3,
    wrangler,
    apply: [
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
