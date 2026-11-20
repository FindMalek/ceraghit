import { timingSafeEqual } from "node:crypto"
import { type Db, rateLimits } from "@workspace/db"
import type { PublicErrorReason } from "@workspace/sdk"
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from "@workspace/sdk/proxy"
import { eq, lt, sql } from "drizzle-orm"
import { publicError } from "../errors"
import { recordRateLimitBlocked } from "./metrics"

export interface Limit {
  max: number
  windowMs: number
}

const MINUTE = 60_000

export const LIMITS = {
  loginIp: { max: 5, windowMs: 15 * MINUTE },
  loginEmail: { max: 10, windowMs: 60 * MINUTE },
  orderCreate: { max: 10, windowMs: 10 * MINUTE },
  orderGet: { max: 60, windowMs: 10 * MINUTE },
  shippingQuote: { max: 30, windowMs: MINUTE },
  requestCreate: { max: 5, windowMs: 60 * MINUTE },
  mailDomain: { max: 6, windowMs: 10 * MINUTE },
  mailTest: { max: 5, windowMs: 10 * MINUTE },
  shippingTest: { max: 10, windowMs: 10 * MINUTE },
  uploadUrl: { max: 12, windowMs: 10 * MINUTE },
  mediaSign: { max: 60, windowMs: 10 * MINUTE },
  mediaConfirm: { max: 60, windowMs: 10 * MINUTE },
  mediaRemove: { max: 60, windowMs: 10 * MINUTE },
} as const satisfies Record<string, Limit>

/** Rows older than this are dead for every limit above. */
const SWEEP_AFTER_MS = 24 * 60 * MINUTE

function sameSecret(given: string | null, wanted: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(wanted)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The visitor's address. Behind the /api proxy the api only sees the web function, so the proxy forwards the real one
 * in a header signed with PROXY_SECRET; the header is ignored without the matching secret.
 */
export function clientAddress(headers: Headers, proxySecret?: string): string {
  const forwarded = headers.get(CLIENT_IP_HEADER)?.trim()
  if (forwarded && proxySecret && sameSecret(headers.get(PROXY_SECRET_HEADER), proxySecret)) return forwarded
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local"
}

/** Counts one hit in a fixed window with a single statement, and says whether it is within the limit. */
export async function takeLimit(db: Db, key: string, limit: Limit, now: Date): Promise<boolean> {
  const at = sql`${now.toISOString()}::timestamptz`
  const expired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - limit.windowMs).toISOString()}::timestamptz`
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${at} else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count })
  return (row?.count ?? 1) <= limit.max
}

/** Whether the key already used up its limit, without counting. */
export async function isLimited(db: Db, key: string, limit: Limit, now: Date): Promise<boolean> {
  const row = await db.query.rateLimits.findFirst({ where: eq(rateLimits.key, key) })
  if (!row || row.windowStart.getTime() <= now.getTime() - limit.windowMs) return false
  return row.count >= limit.max
}

export async function resetLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key))
}

export async function sweepRateLimits(db: Db, now: Date): Promise<number> {
  const gone = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - SWEEP_AFTER_MS)))
    .returning({ key: rateLimits.key })
  return gone.length
}

/** Three buckets only: a metric attribute never names the endpoint. */
function limitBucket(name: keyof typeof LIMITS): "login" | "orders" | "requests" {
  if (name === "loginIp" || name === "loginEmail") return "login"
  if (name === "orderCreate" || name === "orderGet") return "orders"
  return "requests"
}

interface LimitContext {
  db: Db
  headers: Headers
  now: () => Date
  config: { proxySecret?: string }
}

/** Counts a hit for this visitor on `name` and says whether it is still within the limit, without throwing. */
export async function withinLimit(context: LimitContext, name: keyof typeof LIMITS): Promise<boolean> {
  const address = clientAddress(context.headers, context.config.proxySecret)
  return takeLimit(context.db, `${name}:${address}`, LIMITS[name], context.now())
}

/** Counts a hit for this visitor on `name` and throws a guest-safe 429 once the limit is used up. */
export async function enforceLimit(
  context: LimitContext,
  name: keyof typeof LIMITS,
  reason: PublicErrorReason,
  message: string,
): Promise<void> {
  const address = clientAddress(context.headers, context.config.proxySecret)
  if (!(await takeLimit(context.db, `${name}:${address}`, LIMITS[name], context.now()))) {
    recordRateLimitBlocked(limitBucket(name))
    throw publicError("TOO_MANY_REQUESTS", reason, message)
  }
}
