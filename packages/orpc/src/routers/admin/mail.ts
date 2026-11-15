import { ORPCError } from "@orpc/server"
import { mailLog, orders } from "@workspace/db"
import { mailLogItemSchema } from "@workspace/sdk"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { resendMail } from "../../lib/mail-log"
import { adminProcedure } from "../../procedures"

const TAG = ["admin"]
const idInput = z.object({ id: z.string().uuid() })

export const mailRouter = {
  failures: adminProcedure
    .route({ method: "GET", path: "/admin/mail/failures", summary: "Mails that could not be sent", tags: TAG })
    .input(z.object({}))
    .output(z.object({ items: z.array(mailLogItemSchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: mailLog.id,
          kind: mailLog.kind,
          to: mailLog.to,
          subject: mailLog.subject,
          error: mailLog.error,
          attempts: mailLog.attempts,
          createdAt: mailLog.createdAt,
          orderNumber: orders.number,
        })
        .from(mailLog)
        .leftJoin(orders, eq(orders.id, mailLog.orderId))
        .where(eq(mailLog.status, "failed"))
        .orderBy(desc(mailLog.createdAt))
        .limit(100)
      return { items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) }
    }),

  resend: adminProcedure
    .route({ method: "POST", path: "/admin/mail/{id}/resend", summary: "Send a failed mail again", tags: TAG })
    .input(idInput)
    .output(z.object({ ok: z.boolean() }))
    .handler(async ({ context, input }) => {
      const ok = await resendMail(context, input.id)
      if (ok === null) throw new ORPCError("NOT_FOUND", { message: "Email introuvable." })
      return { ok }
    }),

  dismiss: adminProcedure
    .route({ method: "POST", path: "/admin/mail/{id}/dismiss", summary: "Stop showing a failed mail", tags: TAG })
    .input(idInput)
    .output(z.object({ ok: z.boolean() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .update(mailLog)
        .set({ status: "resent" })
        .where(and(eq(mailLog.id, input.id), eq(mailLog.status, "failed")))
        .returning({ id: mailLog.id })
      if (!rows.length) throw new ORPCError("NOT_FOUND", { message: "Email introuvable." })
      return { ok: true }
    }),
}
