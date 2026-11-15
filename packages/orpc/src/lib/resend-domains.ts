import { z } from "zod"

const API = "https://api.resend.com"
const TIMEOUT_MS = 5000

export const domainRecordSchema = z
  .object({
    record: z.string(),
    name: z.string(),
    type: z.string(),
    ttl: z.union([z.string(), z.number()]).optional(),
    status: z.string(),
    value: z.string(),
    priority: z.number().nullish(),
  })
  .passthrough()

const domainSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    records: z.array(domainRecordSchema).default([]),
  })
  .passthrough()

const listSchema = z.object({ data: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()) })

export type ResendDomain = z.infer<typeof domainSchema>
export type DomainRecord = z.infer<typeof domainRecordSchema>

/** `restricted_key`: a "sending access" key cannot read domains (401/403). `unavailable`: network, 5xx or an unexpected body. */
export type DomainResult<T> = { kind: "ok"; value: T } | { kind: "restricted_key" } | { kind: "unavailable" }

async function call<T>(
  apiKey: string,
  http: typeof fetch,
  path: string,
  schema: z.ZodType<T>,
  method: "GET" | "POST" = "GET",
): Promise<DomainResult<T>> {
  let res: Response
  try {
    res = await http(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { kind: "unavailable" }
  }
  if (res.status === 401 || res.status === 403) return { kind: "restricted_key" }
  if (!res.ok) return { kind: "unavailable" }
  const parsed = schema.safeParse(await res.json().catch(() => null))
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "unavailable" }
}

export const listDomains = (apiKey: string, http: typeof fetch = fetch) => call(apiKey, http, "/domains", listSchema)

export const getDomain = (apiKey: string, id: string, http: typeof fetch = fetch) =>
  call(apiKey, http, `/domains/${encodeURIComponent(id)}`, domainSchema)

/** Asks Resend to check the DNS records again; the answer only carries the id, read the domain afterwards. */
export const verifyDomain = (apiKey: string, id: string, http: typeof fetch = fetch) =>
  call(apiKey, http, `/domains/${encodeURIComponent(id)}/verify`, z.object({}).passthrough(), "POST")

export type EmailDomainState = "verified" | "pending" | "failed" | "not_found" | "restricted_key" | "not_configured"

/** Maps Resend's status (`not_started`, `pending`, `verified`, `failed`, `temporary_failure`) to what the owner sees. */
export function emailDomainState(domain: { status: string } | null): EmailDomainState {
  if (!domain) return "not_found"
  if (domain.status === "verified") return "verified"
  if (domain.status === "failed" || domain.status === "temporary_failure") return "failed"
  return "pending"
}

export const emailDomainVerified = (state: EmailDomainState) => state === "verified"

/** The domain of an `EMAIL_FROM` value ("Name <a@b.c>" or "a@b.c"), lowercase. */
export function domainOfFrom(from: string): string | null {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from
  const domain = address.trim().split("@")[1]
  return domain ? domain.toLowerCase() : null
}
