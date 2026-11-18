/** Keys whose value never reaches a log line: credentials first, then anything that identifies a person. */
const SECRET_KEY = /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|credential|session|dsn|pay[-_]?url/i
const PII_KEY = /email|phone|address|iban|bic|(^|[._-])rib([._-]|$)|key$|name$/i
/** A key called `hostname` or `filename` is infrastructure noise, not a person. */
const HARMLESS = /^(host_?name|file_?name|stream_?name|service_?name|container_?name)$/i
/** Any address, even inside a sentence or a provider error, keeps its domain only. */
const EMAIL = /[^\s@<>()[\]"']+@[^\s@<>()[\]"']+\.[A-Za-z]{2,}/g
const MAX_DEPTH = 6

export const REDACTED = "[redacted]"

const isSecretKey = (key: string): boolean => !HARMLESS.test(key) && (SECRET_KEY.test(key) || PII_KEY.test(key))

const maskEmail = (value: string): string =>
  value.replace(EMAIL, (email) => `***@${email.slice(email.indexOf("@") + 1)}`)

/**
 * Copies `value` with every secret or personal field blanked and errors flattened, so a log line can never leak a
 * credential or a customer. Emails embedded in plain strings keep their domain only.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    const extra = redact({ ...value }, depth + 1, seen) as Record<string, unknown>
    const cause = value.cause === undefined ? {} : { cause: redact(value.cause, depth + 1, seen) }
    return { name: value.name, message: maskEmail(value.message), stack: value.stack, ...cause, ...extra }
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return value.toString()
    return typeof value === "string" ? maskEmail(value) : value
  }
  if (value instanceof Headers) return redact(Object.fromEntries(value.entries()), depth, seen)
  if (value instanceof URL) return maskEmail(value.toString())
  if (value instanceof Date) return value.toISOString()
  if (seen.has(value) || depth >= MAX_DEPTH) return "[truncated]"
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSecretKey(key) ? REDACTED : redact(item, depth + 1, seen)
  }
  return out
}
