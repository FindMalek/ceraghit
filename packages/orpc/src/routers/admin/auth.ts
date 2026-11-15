import { ORPCError } from "@orpc/server"
import { loginSchema } from "@workspace/sdk"
import { z } from "zod"
import { ADMIN_COOKIE } from "../../lib/auth"
import { readCookie, serializeCookie } from "../../lib/cookies"
import { clientAddress } from "../../lib/rate-limit"
import { adminProcedure, publicProcedure } from "../../procedures"

const adminSchema = z.object({ id: z.string(), email: z.string(), name: z.string(), nameConfirmed: z.boolean() })

export const authRouter = {
  login: publicProcedure
    .route({ method: "POST", path: "/admin/login", summary: "Sign in (sets an http-only cookie)", tags: ["admin"] })
    .input(loginSchema)
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context, input }) => {
      const address = clientAddress(context.headers, context.config.proxySecret)
      const lock = await context.auth.locked(address, input.email)
      if (lock) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: `Too many attempts. Try again in ${lock === "email" ? "1 hour" : "15 minutes"}.`,
        })
      }
      const session = await context.auth.login(address, input.email, input.password)
      if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Wrong email or password." })
      context.resHeaders?.append(
        "set-cookie",
        serializeCookie(ADMIN_COOKIE, session.token, {
          expires: session.expires,
          secure: context.config.secureCookies,
        }),
      )
      return { ok: true as const }
    }),

  logout: publicProcedure
    .route({ method: "POST", path: "/admin/logout", summary: "Sign out", tags: ["admin"] })
    .output(z.object({ ok: z.literal(true) }))
    .handler(async ({ context }) => {
      await context.auth.logout(readCookie(context.headers, ADMIN_COOKIE))
      context.resHeaders?.append(
        "set-cookie",
        serializeCookie(ADMIN_COOKIE, "", { expires: new Date(0), secure: context.config.secureCookies }),
      )
      return { ok: true as const }
    }),

  me: adminProcedure
    .route({ method: "GET", path: "/admin/me", summary: "The signed-in admin", tags: ["admin"] })
    .output(adminSchema)
    .handler(({ context }) => {
      const { nameConfirmedAt, ...admin } = context.admin
      return { ...admin, nameConfirmed: !!nameConfirmedAt }
    }),
}
