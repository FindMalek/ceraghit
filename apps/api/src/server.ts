import { timingSafeEqual } from "node:crypto"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { RPCHandler } from "@orpc/server/fetch"
import { ResponseHeadersPlugin, SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import {
  appRouter,
  createContext,
  effectivePaymentMethods,
  resolvePayments,
  runJob,
  type Services,
  settleOrder,
  shippingHealth,
} from "@workspace/orpc"
import { HSTS } from "@workspace/sdk/security"
import { sql } from "drizzle-orm"
import { CRON_JOBS, type CronJob } from "./cron"

async function paymentsHealth(services: Services, db: boolean): Promise<string> {
  const payments = db
    ? await resolvePayments(services).catch((error) => {
        console.error("[health] payments fallback", error instanceof Error ? error.message : "resolve failed")
        return services.payments
      })
    : services.payments
  return `${payments.name}:${payments.mode}`
}

const DOCS_REDIRECTS = ["/", "/docs"]
const NO_STORE_PREFIXES = ["/rpc", "/v1", "/health", "/cron", "/webhooks"]

/**
 * Routes:
 *   /rpc/*              oRPC, used by web + dashboard through their /api proxy (needs `x-csrf-token: orpc`)
 *   /v1/*               the same procedures as REST (OpenAPI), docs at /v1/docs, spec at /v1/openapi.json (not in production)
 *   /webhooks/konnect   payment gateway callback, only a hint: the order is settled by re-asking the gateway
 *   /cron/<name>        scheduled job from `cron.ts` (bearer CRON_SECRET), each run recorded in `job_runs`
 *   /files/<key>        redirect to the CDN or a signed url for an uploaded image
 *   /health             db + payment mode, for Dokploy and uptime checks
 */
const PAYMENT_REF = /^[A-Za-z0-9_-]{1,100}$/

/** Letters, digits, dot, dash and underscore in `/`-separated segments: every key the app creates fits. */
const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

function decodeKey(path: string): string | null {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

const peers = new WeakMap<Request, string>()

/** The host hands the socket address next to the request; the handlers only get the request, so remember it here. */
export function rememberPeer(request: Request, address: string | undefined): void {
  if (address) peers.set(request, address)
}

export function createServer(services: Services, jobs: Record<string, CronJob> = CRON_JOBS) {
  const rpc = new RPCHandler(appRouter, {
    plugins: [new ResponseHeadersPlugin(), new SimpleCsrfProtectionHandlerPlugin()],
  })
  const production = services.config.appEnv === "production"
  const rest = new OpenAPIHandler(appRouter, {
    plugins: [
      new ResponseHeadersPlugin(),
      ...(production
        ? []
        : [
            new OpenAPIReferencePlugin({
              docsPath: "/docs",
              specPath: "/openapi.json",
              docsTitle: "Ceraghit API",
              schemaConverters: [new ZodToJsonSchemaConverter()],
              specGenerateOptions: {
                info: {
                  title: "Ceraghit API",
                  version: "1.0.0",
                  description: "Catalogue, orders, payments and the admin.",
                },
                servers: [{ url: `${services.config.apiPublicUrl}/v1` }],
              },
            }),
          ]),
    ],
  })

  /** Every response gets the same hardening, whichever branch built it (redirects have immutable headers, so copy). */
  function harden(pathname: string, response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set("x-content-type-options", "nosniff")
    headers.set("referrer-policy", "no-referrer")
    if (production) headers.set("strict-transport-security", HSTS)
    if (
      !headers.has("cache-control") &&
      NO_STORE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      headers.set("cache-control", "no-store")
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    if (production && DOCS_REDIRECTS.includes(pathname))
      return Response.json({ message: "Not found." }, { status: 404 })
    if (pathname === "/" || pathname === "/docs") return Response.redirect(new URL("/v1/docs", request.url), 302)
    if (pathname === "/health") {
      const db = await services.db
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false)
      return Response.json(
        {
          ok: db,
          db,
          payments: await paymentsHealth(services, db),
          shipping: db ? await shippingHealth(services) : null,
          onlinePayments: db ? (await effectivePaymentMethods(services)).online : null,
          env: services.config.deployEnv,
        },
        { status: db ? 200 : 503 },
      )
    }
    if (pathname.startsWith("/cron/")) {
      const secret = services.config.cronSecret
      const name = pathname.slice("/cron/".length)
      const job = Object.hasOwn(jobs, name) ? jobs[name] : undefined
      if (!secret || request.method !== "POST" || !job) return Response.json({ message: "Not found." }, { status: 404 })
      const given = Buffer.from(request.headers.get("authorization") ?? "")
      const wanted = Buffer.from(`Bearer ${secret}`)
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return new Response("Unauthorized", { status: 401 })
      }
      const dryRun = url.searchParams.get("dryRun") === "1"
      const outcome = await runJob(services, name, (now) => job.run(services, now, { dryRun }))
      return Response.json(outcome, { status: outcome.ok ? 200 : 500 })
    }
    if (pathname === "/webhooks/konnect") {
      const ref = url.searchParams.get("payment_ref")
      if (ref && PAYMENT_REF.test(ref))
        await settleOrder(services, ref).catch((error) =>
          console.error("[webhook]", error instanceof Error ? error.message : "settle failed"),
        )
      return Response.json({ ok: true })
    }
    if (pathname.startsWith("/files/")) {
      if (!services.storage) return Response.json({ message: "Storage is not configured." }, { status: 404 })
      const key = decodeKey(pathname.slice("/files/".length))
      // Only the characters the app writes into keys are served. Anything else (a `%`, a backslash, a tab, a dot
      // segment) is refused instead of reasoned about: the URL parser that later builds the signed link normalises
      // all of those, so a decoded key could otherwise turn into a different one. `private/` holds carrier labels,
      // only ever read through a short-lived signed link, never this public redirect.
      const rest = key?.slice(services.storage.prefix.length) ?? ""
      if (
        key === null ||
        !SAFE_KEY.test(key) ||
        !key.startsWith(services.storage.prefix) ||
        key.split("/").some((segment) => segment === "." || segment === "..") ||
        rest.split("/")[0] === "private"
      ) {
        return Response.json({ message: "Not found." }, { status: 404 })
      }
      return new Response(null, {
        status: 302,
        headers: { location: await services.storage.readUrl(key), "cache-control": "public, max-age=3000" },
      })
    }

    const context = createContext(services, request.headers, peers.get(request))
    const viaRpc = await rpc.handle(request, { prefix: "/rpc", context })
    if (viaRpc.matched) return viaRpc.response
    const viaRest = await rest.handle(request, { prefix: "/v1", context })
    if (viaRest.matched) return viaRest.response
    return Response.json({ message: "Not found." }, { status: 404 })
  }

  return async function fetch(request: Request): Promise<Response> {
    return harden(new URL(request.url).pathname, await route(request))
  }
}
