import { ORPCError } from "@orpc/server"
import { changePasswordSchema } from "@workspace/sdk"
import { z } from "zod"
import { ADMIN_COOKIE } from "../../lib/auth"
import { readCookie } from "../../lib/cookies"
import { addressOf } from "../../lib/rate-limit"
import { adminProcedure } from "../../procedures"

export const accountRouter = {
  changePassword: adminProcedure
    .route({
      method: "PUT",
      path: "/admin/account/password",
      summary: "Change the owner password (signs the other sessions out)",
      tags: ["admin"],
    })
    .input(changePasswordSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const result = await context.auth.changePassword(
        context.admin,
        readCookie(context.headers, ADMIN_COOKIE),
        addressOf(context),
        input.currentPassword,
        input.newPassword,
      )
      if (result === "limited") {
        throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many attempts. Try again in 15 minutes." })
      }
      if (result === "wrong") throw new ORPCError("BAD_REQUEST", { message: "Wrong current password." })
      return { ok: true as const }
    }),
}
