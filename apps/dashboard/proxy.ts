import { securityFromEnv } from "@workspace/sdk/security"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login"]

/** Optimistic check only: no cookie means straight to /login. The api still validates every call. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const needsLogin = !PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  if (needsLogin && !request.cookies.has("ceraghit_admin")) return NextResponse.redirect(new URL("/login", request.url))
  const security = securityFromEnv("dashboard")
  const headers = new Headers(request.headers)
  for (const [name, value] of Object.entries(security.request)) headers.set(name, value)
  const response = NextResponse.next({ request: { headers } })
  for (const [name, value] of Object.entries(security.response)) response.headers.set(name, value)
  return response
}

export const config = { matcher: ["/((?!api|_next|logo.webp|texture.webp|favicon.ico).*)"] }
