// Stand-in for Groq in the e2e stack. The api reaches it through GROQ_BASE_URL.
// Nothing real is ever called. Specs steer it over `/__groq/*` (see support/stubs.ts).
declare const Bun: {
  serve(options: { port: number; idleTimeout: number; fetch(req: Request): Response | Promise<Response> }): unknown
}

const port = Number(process.env.E2E_STUB_PORT ?? 9300)
const groq: { mode: string; requests: { model: string; targets: string[]; auth: boolean }[] } = {
  mode: "ok",
  requests: [],
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers })

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
console.info(`e2e stub on http://localhost:${port}`)
