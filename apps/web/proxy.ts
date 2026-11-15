import { securityFromEnv } from "@workspace/sdk/security"
import { NextRequest } from "next/server"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

const intl = createMiddleware(routing)

export default function proxy(request: NextRequest) {
  const security = securityFromEnv("web")
  const headers = new Headers(request.headers)
  for (const [name, value] of Object.entries(security.request)) headers.set(name, value)
  const response = intl(new NextRequest(request, { headers }))
  for (const [name, value] of Object.entries(security.response)) response.headers.set(name, value)
  return response
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] }
