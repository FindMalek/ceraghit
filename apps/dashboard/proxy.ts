import { type NextRequest, NextResponse } from "next/server"

/** Optimistic check only: no cookie means straight to /login. The api still validates every call. */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ceraghit_admin")) return NextResponse.redirect(new URL("/login", request.url))
  return NextResponse.next()
}

export const config = { matcher: ["/((?!login|api|_next|logo.webp|texture.webp|favicon.ico).*)"] }
