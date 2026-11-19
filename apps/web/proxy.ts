import { securityFromEnv } from "@workspace/sdk/security"
import { NextRequest, NextResponse } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { apexHost } from "./lib/seo"

const intl = createMiddleware(routing)

export default function proxy(request: NextRequest) {
  const apex = apexHost(request.headers.get("host") ?? "")
  if (apex) {
    const url = request.nextUrl.clone()
    url.host = apex
    url.protocol = "https:"
    url.port = ""
    return NextResponse.redirect(url, 308)
  }
  const security = securityFromEnv("web")
  const headers = new Headers(request.headers)
  for (const [name, value] of Object.entries(security.request)) headers.set(name, value)
  const response = intl(new NextRequest(request, { headers }))
  for (const [name, value] of Object.entries(security.response)) response.headers.set(name, value)
  return response
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] }
