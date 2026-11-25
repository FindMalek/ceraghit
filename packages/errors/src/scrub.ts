import { redact } from "@workspace/logger/redact"

type Bag = Record<string, unknown>

const NOISE =
  /NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|ResizeObserver loop|AbortError|Failed to fetch|Load failed|NetworkError when attempting|TOO_MANY_REQUESTS|rate.?limit/i
const KEPT_HEADERS = new Set(["user-agent", "content-type", "x-request-id", "accept-language"])
const KEPT_CONTEXTS = new Set(["os", "runtime", "browser", "device", "trace", "culture"])
const BODY_KEYS = ["body", "request_body", "response_body", "requestBody", "responseBody", "input", "arguments"]
const DROPPED_BREADCRUMBS = new Set(["console", "ui.input", "navigation"])

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g
const PHONE = /\+?\d[\d\s().-]{7,}\d/g
const BASIC = /Basic\s+[A-Za-z0-9+/=]{6,}/gi
/** `"password":"x"`, `access_token=x`, also inside escaped json: the key stays, the value goes. */
const CREDENTIAL_FIELD =
  /((?:pass(?:word|wd)?|secret|token|authorization|cookie|api[-_]?key|credential|session|dsn)[\w-]*(?:\\*["'])?\s*[:=]\s*)(?:\\+"[^"\\]*\\+"|"(?:\\.|[^"\\])*"|'[^']*'|[^\s,;&}]+)/gi
/** Drizzle puts every bound value (names, addresses, hashes) in the message of a failed query. */
const QUERY_PARAMS = /(Failed query:[\s\S]*?\nparams:)[\s\S]*/
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/"']+@/gi
const URL_QUERY = /\b(https?:\/\/[^\s"'<>?#]*)[?#][^\s"'<>]*/gi
/** A Tunisian number written without +216: 8 digits, grouped 2-3-3 or not at all. */
const LOCAL_PHONE = /(?<![\w.-])[2-9]\d(?:[ .]?\d{3}){2}(?![\w-]|\.\d)/g
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g

/** A message or url keeps its meaning but loses emails, phones, ibans, bearer tokens and anything key-shaped. */
export function scrubString(value: string): string {
  const stripped = value
    .replace(QUERY_PARAMS, "$1 [redacted]")
    .replace(URL_USERINFO, "$1[redacted]@")
    .replace(URL_QUERY, "$1")
  return (redact(stripped) as string)
    .replace(BEARER, "Bearer [redacted]")
    .replace(BASIC, "Basic [redacted]")
    .replace(CREDENTIAL_FIELD, "$1[redacted]")
    .replace(IBAN, "[iban]")
    .replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 9 ? "[phone]" : match))
    .replace(LOCAL_PHONE, "[phone]")
    .replace(LONG_SECRET, "[redacted]")
}

/** Origin and path only: no query, no fragment, and path segments that look like a token or an address become `:id`. */
export function scrubUrl(value: string): string {
  const [withoutHash = ""] = value.split("#")
  const [base = ""] = withoutHash.split("?")
  return base
    .split("/")
    .map((segment) =>
      /^[A-Za-z0-9_-]{24,}$/.test(segment) || segment.includes("@") || /%40/i.test(segment) ? ":id" : segment,
    )
    .join("/")
}

/** Routes whose payloads must never leave the server, whatever else is configured. */
export const SENSITIVE_ROUTE =
  /\/(admin|login|logout|vault|secrets|uploads?|webhooks|session|password|onboarding)(\/|$|\?)|\/rpc\/admin/i

const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value)

/** Every depth, arrays included: bodies removed, strings scrubbed, urls cut to their path. */
function deepScrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value)
  if (depth > 8 || typeof value !== "object" || value === null) return value
  if (Array.isArray(value)) return value.map((item) => deepScrub(item, depth + 1))
  const out: Bag = {}
  for (const [key, item] of Object.entries(value)) {
    if (BODY_KEYS.includes(key)) continue
    out[key] =
      ["url", "from", "to"].includes(key) && typeof item === "string"
        ? scrubString(scrubUrl(item))
        : deepScrub(item, depth + 1)
  }
  return out
}

function scrubData(data: unknown): Bag | undefined {
  if (!isBag(data)) return undefined
  return deepScrub(redact(data)) as Bag
}

interface BreadcrumbLike {
  category?: string
  message?: string
  data?: unknown
}

/** Drops console and typing breadcrumbs, strips bodies and query strings from the rest. Null drops the breadcrumb. */
export function scrubBreadcrumb<T>(input: T): T | null {
  const crumb = input as BreadcrumbLike
  if (crumb.category && DROPPED_BREADCRUMBS.has(crumb.category)) return null
  const next: BreadcrumbLike = { ...crumb }
  if (typeof next.message === "string") next.message = scrubString(next.message)
  if (next.data !== undefined) next.data = scrubData(next.data)
  return next as unknown as T
}

interface FrameLike {
  vars?: unknown
}
interface ExceptionLike {
  type?: string
  value?: string
  stacktrace?: { frames?: FrameLike[] }
}
interface EventLike {
  message?: string
  user?: unknown
  server_name?: string
  request?: Bag
  extra?: unknown
  contexts?: Bag
  tags?: Bag
  breadcrumbs?: BreadcrumbLike[]
  exception?: { values?: ExceptionLike[] }
  transaction?: string
}

function isNoise(event: EventLike): boolean {
  const first = event.exception?.values?.[0]
  const text = `${first?.type ?? ""} ${first?.value ?? ""} ${event.message ?? ""}`
  if (NOISE.test(text)) return true
  const status = Number(event.tags?.["http.status"])
  return Number.isFinite(status) && status > 0 && status < 500
}

/**
 * `beforeSend` for every runtime. Returns null for known noise (redirects, not found, 4xx answers, rate limits, flaky
 * browser networks). Everything else is rebuilt without a user, ip, cookie, header outside a short list, request body,
 * query string, local variable or unknown context, and every string is scrubbed.
 */
export function scrubEvent<T>(input: T): T | null {
  const event = input as EventLike
  if (isNoise(event)) return null
  const next: EventLike = { ...event }
  next.user = undefined
  next.server_name = undefined
  if (typeof next.message === "string") next.message = scrubString(next.message)
  if (typeof next.transaction === "string") next.transaction = scrubUrl(next.transaction)

  const request = event.request
  const route = typeof event.tags?.route === "string" ? event.tags.route : ""
  const sensitive =
    (typeof request?.url === "string" && SENSITIVE_ROUTE.test(request.url)) || SENSITIVE_ROUTE.test(route)
  if (request) {
    const headers = isBag(request.headers)
      ? Object.fromEntries(Object.entries(request.headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())))
      : undefined
    next.request = {
      ...(typeof request.method === "string" ? { method: request.method } : {}),
      ...(typeof request.url === "string" ? { url: scrubUrl(request.url) } : {}),
      ...(headers ? { headers } : {}),
    }
  }

  next.extra = sensitive ? undefined : scrubData(event.extra)
  if (event.contexts) {
    next.contexts = redact(
      Object.fromEntries(Object.entries(event.contexts).filter(([name]) => KEPT_CONTEXTS.has(name))),
    ) as Bag
  }
  if (event.tags) {
    next.tags = Object.fromEntries(
      Object.entries(event.tags).map(([name, value]) => [
        name,
        typeof value === "string" ? (redact(value) as string) : value,
      ]),
    )
  }
  if (event.breadcrumbs) {
    next.breadcrumbs = sensitive
      ? []
      : event.breadcrumbs
          .map((crumb) => scrubBreadcrumb(crumb))
          .filter((crumb): crumb is BreadcrumbLike => crumb !== null)
  }
  if (event.exception?.values) {
    next.exception = {
      ...event.exception,
      values: event.exception.values.map((item) => ({
        ...item,
        ...(typeof item.value === "string" ? { value: scrubString(item.value) } : {}),
        ...(item.stacktrace?.frames
          ? {
              stacktrace: {
                ...item.stacktrace,
                frames: item.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame),
              },
            }
          : {}),
      })),
    }
  }
  return next as unknown as T
}
