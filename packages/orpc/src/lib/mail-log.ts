import { mailLog } from "@workspace/db"
import { and, asc, eq, gt, lt, ne } from "drizzle-orm"
import type { Services } from "../context"
import { type Mail, MailError } from "./mailer"
import { recordEmail } from "./metrics"

export type MailKind =
  | "order_confirmation"
  | "order_studio"
  | "request_studio"
  | "payment_received"
  | "order_expired"
  | "shipped"
  | "test"

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [1000, 4000]
const MAX_WAIT_MS = 10_000
export const MAIL_RETENTION_DAYS = 90

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Short, and never holds more than what the provider said. */
function describe(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown error").slice(0, 300)
}

/**
 * The only way to send a mail: the outcome is always written to `mail_log`, and it never throws so a mail problem
 * cannot fail an order. Returns whether the mail went out.
 *
 * `inline` is for request paths a customer waits on: one attempt, no pause. The failure row is the retry queue, the
 * owner resends from the dashboard. Otherwise transient errors are retried twice with a pause.
 * `existingId` is a failed row being resent: it is updated instead of adding a second row.
 */
export async function deliverMail(
  services: Services,
  kind: MailKind,
  mail: Mail,
  opts: { orderId?: string; inline?: boolean; existingId?: string; locale?: string } = {},
): Promise<boolean> {
  const { db, mailer, now } = services
  const sleep = services.sleep ?? sleepFor
  const maxAttempts = opts.inline ? 1 : MAX_ATTEMPTS
  const keyed = { ...mail, idempotencyKey: crypto.randomUUID() }
  let attempts = 0
  let providerId: string | null = null
  let error: string | null = null
  while (attempts < maxAttempts) {
    attempts++
    try {
      const sent = await mailer.send(keyed)
      providerId = sent?.id ?? null
      error = null
      break
    } catch (e) {
      error = describe(e)
      const transient = e instanceof MailError && e.transient
      if (!transient || attempts === maxAttempts) break
      const wanted = e instanceof MailError ? e.retryAfterMs : undefined
      await sleep(Math.min(wanted ?? BACKOFF_MS[attempts - 1]!, MAX_WAIT_MS))
    }
  }
  const ok = error === null
  try {
    if (opts.existingId) {
      const row = await db.query.mailLog.findFirst({ where: eq(mailLog.id, opts.existingId) })
      await db
        .update(mailLog)
        .set(
          ok
            ? { status: "resent", providerId, error: null, attempts: (row?.attempts ?? 0) + attempts, sentAt: now() }
            : { error, attempts: (row?.attempts ?? 0) + attempts },
        )
        .where(eq(mailLog.id, opts.existingId))
    } else {
      await db.insert(mailLog).values({
        kind,
        orderId: opts.orderId ?? null,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        replyTo: mail.replyTo ?? null,
        status: ok ? "sent" : "failed",
        providerId,
        error,
        attempts,
        sentAt: ok ? now() : null,
      })
    }
  } catch (e) {
    console.error("[mail log]", describe(e))
  }
  recordEmail(kind, ok, opts.locale)
  if (!ok) console.error(`[mail ${kind}] ${mail.to}:`, error)
  return ok
}

/** Resends a failed mail through the normal path. Only the stored text is sent again (the log keeps no html); the same row is closed on success or keeps the new error. */
export async function resendMail(services: Services, id: string): Promise<boolean | null> {
  const row = await services.db.query.mailLog.findFirst({
    where: and(eq(mailLog.id, id), eq(mailLog.status, "failed")),
  })
  if (!row) return null
  return deliverMail(
    services,
    row.kind as MailKind,
    { to: row.to, subject: row.subject, text: row.text, replyTo: row.replyTo ?? undefined },
    { orderId: row.orderId ?? undefined, existingId: id },
  )
}

/** Stored bodies hold customer details: rows go after 90 days, except failures the owner has not dealt with yet. */
export async function purgeMailLog(services: Pick<Services, "db" | "now">): Promise<number> {
  const before = new Date(services.now().getTime() - MAIL_RETENTION_DAYS * 864e5)
  const rows = await services.db
    .delete(mailLog)
    .where(and(lt(mailLog.createdAt, before), ne(mailLog.status, "failed")))
    .returning({ id: mailLog.id })
  return rows.length
}

const RETRY_BATCH = 20
const RETRY_MAX_ATTEMPTS = 9
const RETRY_WINDOW_HOURS = 24

/**
 * Sends failed mails again, oldest first. Each resend already retries transient errors, so a row is given up on after
 * 9 attempts in total or 24 hours, and then waits for the owner in the dashboard. A resent row leaves the queue, which
 * makes a second run a no-op.
 */
export async function retryFailedMails(services: Services): Promise<{ retried: number; sent: number; failed: number }> {
  const since = new Date(services.now().getTime() - RETRY_WINDOW_HOURS * 3600e3)
  const rows = await services.db
    .select({ id: mailLog.id })
    .from(mailLog)
    .where(and(eq(mailLog.status, "failed"), gt(mailLog.createdAt, since), lt(mailLog.attempts, RETRY_MAX_ATTEMPTS)))
    .orderBy(asc(mailLog.createdAt))
    .limit(RETRY_BATCH)
  let sent = 0
  for (const { id } of rows) if (await resendMail(services, id)) sent++
  return { retried: rows.length, sent, failed: rows.length - sent }
}
