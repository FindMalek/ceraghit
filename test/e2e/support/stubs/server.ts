// Stand-in for Konnect and Groq in the e2e stack. The api reaches it through KONNECT_BASE_URL and GROQ_BASE_URL.
// Nothing real is ever called. Specs steer it over `/__konnect/*` and `/__groq/*` (see support/stubs.ts).
declare const Bun: {
  serve(options: { port: number; idleTimeout: number; fetch(req: Request): Response | Promise<Response> }): unknown
}

const port = Number(process.env.E2E_STUB_PORT ?? 9300)
const origin = `http://localhost:${port}`
const KONNECT_KEY = "e2e-konnect-key"

interface KonnectPayment {
  ref: string
  orderId: string
  amount: number
  token: string
  status: string
  successUrl: string
  failUrl: string
}

const payments = new Map<string, KonnectPayment>()
const groq: { mode: string; requests: { model: string; targets: string[]; auth: boolean }[] } = {
  mode: "ok",
  requests: [],
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers })

async function konnect(req: Request, path: string): Promise<Response> {
  const key = req.headers.get("x-api-key")
  if (key !== KONNECT_KEY && !path.startsWith("/pay/")) return json({ message: "unauthorized" }, 401)

  if (req.method === "POST" && path === "/payments/init-payment") {
    const body = (await req.json()) as Record<string, unknown>
    const ref = `stub_${crypto.randomUUID().slice(0, 8)}`
    payments.set(ref, {
      ref,
      orderId: String(body.orderId),
      amount: Number(body.amount),
      token: String(body.token),
      status: "pending",
      successUrl: String(body.successUrl),
      failUrl: String(body.failUrl),
    })
    return json({ payUrl: `${origin}/konnect/pay/${ref}`, paymentRef: ref })
  }
  const get = path.match(/^\/payments\/([^/]+)$/)
  if (req.method === "GET" && get) {
    const payment = payments.get(decodeURIComponent(get[1] ?? ""))
    if (!payment) return json({ message: "not found" }, 404)
    return json({
      payment: { status: payment.status, amount: payment.amount, token: payment.token, orderId: payment.orderId },
    })
  }
  const pay = path.match(/^\/pay\/([^/]+)(?:\/(complete|fail|cancel))?$/)
  if (pay) {
    const payment = payments.get(pay[1] ?? "")
    if (!payment) return new Response("unknown payment", { status: 404 })
    const action = pay[2]
    if (!action) {
      const link = (to: string, label: string) =>
        `<p><a href="${origin}/konnect/pay/${payment.ref}/${to}">${label}</a></p>`
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Konnect sandbox</title><h1>Konnect sandbox</h1>` +
          `<p>Order ${payment.orderId}: ${payment.amount} ${payment.token}</p>` +
          link("complete", "Pay") +
          link("fail", "Payment failed") +
          link("cancel", "Cancel and go back"),
        { headers: { "content-type": "text/html" } },
      )
    }
    if (action === "complete") payment.status = "completed"
    if (action === "fail") payment.status = "failed"
    return Response.redirect(action === "complete" ? payment.successUrl : payment.failUrl, 302)
  }
  return json({ message: "not found" }, 404)
}

async function konnectControl(req: Request, path: string): Promise<Response> {
  if (req.method === "GET" && path === "/payments") return json([...payments.values()])
  const set = path.match(/^\/([^/]+)\/status$/)
  if (req.method === "POST" && set) {
    const payment = payments.get(decodeURIComponent(set[1] ?? ""))
    if (!payment) return json({ message: "not found" }, 404)
    Object.assign(payment, (await req.json()) as Partial<KonnectPayment>)
    return json(payment)
  }
  return json({ message: "not found" }, 404)
}

const GROQ_TEXT: Record<string, string> = {
  en: "Hand-glazed stoneware vase, made in Tunisia.",
  ar: "مزهرية من الخزف الحجري المزجج يدوياً، صنعت في تونس.",
}

async function groqChat(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    model: string
    response_format?: { json_schema?: { schema?: { properties?: Record<string, unknown> } } }
  }
  const targets = Object.keys(body.response_format?.json_schema?.schema?.properties ?? {})
  groq.requests.push({
    model: body.model,
    targets,
    auth: Boolean(req.headers.get("authorization")?.startsWith("Bearer ")),
  })
  const fast = { "retry-after-ms": "5" }
  const primary = body.model === "openai/gpt-oss-120b"
  if (groq.mode === "down") return json({ error: { message: "unavailable", type: "server_error" } }, 503, fast)
  if (groq.mode === "rate_limit" && primary)
    return json({ error: { message: "rate limit", type: "tokens" } }, 429, fast)
  if (groq.mode === "hang" && primary) await new Promise((resolve) => setTimeout(resolve, 120_000))
  let content: string
  if (groq.mode === "malformed") content = "not json at all"
  else if (groq.mode === "too_long")
    content = JSON.stringify(Object.fromEntries(targets.map((lang) => [lang, "x".repeat(5000)])))
  else content = JSON.stringify(Object.fromEntries(targets.map((lang) => [lang, GROQ_TEXT[lang] ?? ""])))
  return json({
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 500, completion_tokens: 700, total_tokens: 1200 },
  })
}

Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname === "/health") return new Response("ok")
    if (pathname.startsWith("/konnect/")) return konnect(req, pathname.slice("/konnect".length))
    if (pathname.startsWith("/__konnect")) return konnectControl(req, pathname.slice("/__konnect".length))
    if (pathname === "/groq/openai/v1/chat/completions" && req.method === "POST") return groqChat(req)
    if (pathname === "/__groq/mode" && req.method === "POST") {
      groq.mode = String(((await req.json()) as { mode: string }).mode)
      groq.requests = []
      return json({ mode: groq.mode })
    }
    if (pathname === "/__groq/requests") return json(groq.requests)
    return json({ message: "not found" }, 404)
  },
})
console.info(`e2e stub on ${origin}`)
