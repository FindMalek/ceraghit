/**
 * Next route handler that forwards /api/* to the api service at runtime, so browsers only ever talk to their own
 * origin (first-party cookies, no CORS) and images stay env-agnostic: API_URL is read per request, not baked at build.
 */
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length"]

/** Paths each app may reach, so the storefront origin can never call an admin procedure (and vice versa). */
export const WEB_ALLOWED = [/^\/rpc\/public\//, /^\/files\//]
export const DASHBOARD_ALLOWED = [/^\/rpc\/admin\//, /^\/files\//]

export function createProxy(allowed: RegExp[]) {
  return (request: Request) => proxyToApi(request, allowed)
}

export async function proxyToApi(request: Request, allowed: RegExp[]): Promise<Response> {
  const base = process.env.API_URL ?? "http://localhost:3001"
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, "")
  if (!allowed.some((rule) => rule.test(path))) return Response.json({ message: "Not found." }, { status: 404 })
  const target = new URL(path + url.search, base)
  const headers = new Headers(request.headers)
  for (const h of HOP_BY_HOP) headers.delete(h)
  headers.set("x-forwarded-host", url.host)
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""))
  const hasBody = !["GET", "HEAD"].includes(request.method)
  const res = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  })
  const out = new Headers(res.headers)
  out.delete("content-encoding")
  out.delete("content-length")
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
}
