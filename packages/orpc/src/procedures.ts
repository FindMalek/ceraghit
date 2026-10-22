import { ORPCError, os } from "@orpc/server"
import type { Context } from "./context"
import { ADMIN_COOKIE } from "./lib/auth"
import { readCookie } from "./lib/cookies"

export const o = os.$context<Context>()

/** Unexpected errors are logged with the procedure path; ORPCErrors are answers, not failures. */
const logErrors = o.middleware(async ({ next, path }) => {
  try {
    return await next()
  } catch (error) {
    if (!(error instanceof ORPCError)) console.error(`[${path.join(".")}]`, error)
    throw error
  }
})

export const publicProcedure = o.use(logErrors)

/**
 * The admin session is an http-only cookie, so admin calls also need the `x-csrf-token: orpc` header, which the
 * oRPC link sends and a cross-site form can't. That covers the REST (OpenAPI) routes too, not just RPC.
 */
const requireAdmin = o.middleware(async ({ context, next }) => {
  if (context.headers.get("x-csrf-token") !== "orpc") {
    throw new ORPCError("FORBIDDEN", { message: "Missing the x-csrf-token header." })
  }
  const admin = await context.auth.admin(readCookie(context.headers, ADMIN_COOKIE))
  if (!admin) throw new ORPCError("UNAUTHORIZED", { message: "Please sign in." })
  return next({ context: { admin } })
})

export const adminProcedure = publicProcedure.use(requireAdmin)
