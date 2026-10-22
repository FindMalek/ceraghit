import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { RPCHandler } from "@orpc/server/fetch"
import { ResponseHeadersPlugin, SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { appRouter, createContext, type Services, settleOrder } from "@workspace/orpc"
import { sql } from "drizzle-orm"

/**
 * Routes:
 *   /rpc/*              oRPC, used by web + dashboard through their /api proxy (needs `x-csrf-token: orpc`)
 *   /v1/*               the same procedures as REST (OpenAPI), docs at /v1/docs, spec at /v1/openapi.json
 *   /webhooks/konnect   payment gateway callback, only a hint: the order is settled by re-asking the gateway
 *   /files/<key>        redirect to the CDN or a signed url for an uploaded image
 *   /health             db + payment mode, for Dokploy and uptime checks
 */
export function createServer(services: Services) {
  const rpc = new RPCHandler(appRouter, {
    plugins: [new ResponseHeadersPlugin(), new SimpleCsrfProtectionHandlerPlugin()],
  })
  const rest = new OpenAPIHandler(appRouter, {
    plugins: [
      new ResponseHeadersPlugin(),
      new OpenAPIReferencePlugin({
        docsPath: "/docs",
        specPath: "/openapi.json",
        docsTitle: "Ceraghit API",
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title: "Ceraghit API", version: "1.0.0", description: "Catalogue, orders, payments and the admin." },
          servers: [{ url: `${services.config.apiPublicUrl}/v1` }],
        },
      }),
    ],
  })

  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    if (pathname === "/" || pathname === "/docs") return Response.redirect(new URL("/v1/docs", request.url), 302)
    if (pathname === "/health") {
      const db = await services.db
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false)
      return Response.json(
        { ok: db, db, payments: `${services.payments.name}:${services.payments.mode}`, env: services.config.deployEnv },
        { status: db ? 200 : 503 },
      )
    }
    if (pathname === "/webhooks/konnect") {
      const ref = url.searchParams.get("payment_ref")
      if (ref) await settleOrder(services, ref).catch((error) => console.error("[webhook]", error))
      return Response.json({ ok: true })
    }
    if (pathname.startsWith("/files/")) {
      if (!services.storage) return Response.json({ message: "Storage is not configured." }, { status: 404 })
      const key = decodeURIComponent(pathname.slice("/files/".length))
      if (!key.startsWith(services.storage.prefix) || key.includes("..")) {
        return Response.json({ message: "Not found." }, { status: 404 })
      }
      return new Response(null, {
        status: 302,
        headers: { location: await services.storage.readUrl(key), "cache-control": "public, max-age=3000" },
      })
    }

    const context = createContext(services, request.headers)
    const viaRpc = await rpc.handle(request, { prefix: "/rpc", context })
    if (viaRpc.matched) return viaRpc.response
    const viaRest = await rest.handle(request, { prefix: "/v1", context })
    if (viaRest.matched) return viaRest.response
    return Response.json({ message: "Not found." }, { status: 404 })
  }
}
