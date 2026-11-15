import { mailLog } from "@workspace/db"
import { and, eq, lt } from "drizzle-orm"
import type { Services } from "../context"
import { type Mail, MailError } from "./mailer"

export type MailKind =
  | "order_confirmation"
  | "order_studio"
  | "request_studio"
  | "payment_received"
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
 * The only way to send a mail: transient failures are retried with a pause, the outcome is always written to
 * `mail_log`, and it never throws so a mail problem cannot fail an order. Returns whether the mail went out.
 */
export async function deliverMail(
  services: Services,
  kind: MailKind,
  mail: Mail,
  opts: { orderId?: string } = {},
): Promise<boolean> {
  const { db, mailer, now } = services
  const sleep = services.sleep ?? sleepFor
  let attempts = 0
  let providerId: string | null = null
  let error: string | null = null
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    try {
      const sent = await mailer.send(mail)
      providerId = sent?.id ?? null
      error = null
      break
    } catch (e) {
      error = describe(e)
      const transient = e instanceof MailError && e.transient
      if (!transient || attempts === MAX_ATTEMPTS) break
      const wanted = e instanceof MailError ? e.retryAfterMs : undefined
      await sleep(Math.min(wanted ?? BACKOFF_MS[attempts - 1]!, MAX_WAIT_MS))
    }
  }
  const ok = error === null
  try {
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
  } catch (e) {
    console.error("[mail log]", describe(e))
  }
  if (!ok) console.error(`[mail ${kind}] ${mail.to}:`, error)
  return ok
}

/** Resends a failed mail through the normal path, then closes the old row. */
export async function resendMail(services: Services, id: string): Promise<boolean | null> {
  const { db } = services
  const row = await db.query.mailLog.findFirst({ where: and(eq(mailLog.id, id), eq(mailLog.status, "failed")) })
  if (!row) return null
  const ok = await deliverMail(
    services,
    row.kind as MailKind,
    { to: row.to, subject: row.subject, text: row.text, replyTo: row.replyTo ?? undefined },
    { orderId: row.orderId ?? undefined },
  )
  if (ok) await db.update(mailLog).set({ status: "resent" }).where(eq(mailLog.id, id))
  return ok
}

/** Stored bodies hold customer details: rows go after 90 days. */
export async function purgeMailLog(services: Pick<Services, "db" | "now">): Promise<number> {
  const before = new Date(services.now().getTime() - MAIL_RETENTION_DAYS * 864e5)
  const rows = await services.db.delete(mailLog).where(lt(mailLog.createdAt, before)).returning({ id: mailLog.id })
  return rows.length
}
