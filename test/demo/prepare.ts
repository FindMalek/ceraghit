// Fills a local demo stack with the mails the email videos (84 to 86, 89, 91) open in Mailpit, through the public and
// admin api only. Not part of a video: run it once before recording, on a fresh seed. Local demo data only.
//   API_URL=http://localhost:3001 CRON_SECRET=... DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... bun prepare.ts
// `expiry` ages an unpaid transfer order past its 7 days and runs /cron/release-holds, for video 89.
import { mkdirSync, writeFileSync } from "node:fs"
import { assertSafe } from "./lib/guard"

const env = process.env
const api = env.API_URL ?? "http://localhost:3001"
const csrf = { "content-type": "application/json", "x-csrf-token": "orpc" }

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { ...csrf, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return { json: (await res.json().catch(() => ({}))) as T, res }
}

await assertSafe({ ...env, WEB_URL: env.WEB_URL ?? "http://localhost:3000", DASHBOARD_URL: env.DASHBOARD_URL ?? "http://localhost:3100" })

const login = await call("POST", "/v1/admin/login", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
const cookie = (login.res.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ")
const admin = { cookie }

const products = (await call<{ id: string; unique: boolean; quoteOnly: boolean; variants: unknown[]; stock: number }[]>("GET", "/v1/products")).json
const pieces = products.filter((p) => !p.unique && !p.quoteOnly && p.variants.length === 0 && p.stock >= 1)
const piece = (i: number) => pieces[i % pieces.length]!.id

const buyer = (n: number) => ({
  customerName: `Amel Trabelsi ${n}`,
  email: `client${n}@example.test`,
  phone: "+21620000000",
  city: "Tunis",
  address: "1 rue de la Médina",
})

const place = async (n: number, order: Record<string, unknown>) =>
  (await call<{ number: string; payUrl: string }>("POST", "/v1/orders", { items: [{ productId: piece(n), quantity: 1 }], ...buyer(n), ...order })).json

if (process.argv[2] === "expiry") {
  const { number } = await place(20, { currency: "EUR", country: "FR", paymentMethod: "transfer", locale: "fr" })
  const sql = new Bun.SQL(env.DATABASE_URL!)
  await sql`update orders set created_at = now() - interval '9 days' where number = ${number}`
  await sql.close()
  await call("POST", "/cron/release-holds", undefined, { authorization: `Bearer ${env.CRON_SECRET}` })
  console.info("expired order", number)
  process.exit(0)
}

const card = await place(1, { currency: "EUR", country: "FR", paymentMethod: "online", locale: "fr" })
const ref = new URL(card.payUrl).searchParams.get("ref")
if (ref) await call("POST", "/v1/orders/demo-resolve", { ref, outcome: "paid" })
const cod = await place(2, { currency: "TND", country: "TN", paymentMethod: "cod", locale: "fr" })
const transfer = await place(3, { currency: "EUR", country: "FR", paymentMethod: "transfer", locale: "en" })
await place(4, { currency: "TND", country: "TN", paymentMethod: "cod", locale: "ar" })
await place(5, { currency: "EUR", country: "DE", paymentMethod: "payoneer", locale: "fr" })

// An online order nobody pays: its checkout url is the demo gateway page video 97 opens ({{DEMO_PAY_URL}}).
const unpaid = await place(6, { currency: "EUR", country: "FR", paymentMethod: "online", locale: "fr" })
mkdirSync("out", { recursive: true })
writeFileSync("out/demo-pay-url.txt", unpaid.payUrl)

const list = (await call<{ items?: { id: string; number: string; totalMinor: number }[] }>("GET", "/v1/admin/orders", undefined, admin)).json
const rows = list.items ?? (list as unknown as { id: string; number: string; totalMinor: number }[])
const idOf = (number: string) => rows.find((o) => o.number === number)!
const paid = idOf(transfer.number)
await call("POST", `/v1/admin/orders/${paid.id}/mark-paid`, { method: "transfer", reference: "VIR-0086", note: null, totalMinor: paid.totalMinor, currency: "EUR" }, admin)
await call("POST", `/v1/admin/orders/${idOf(cod.number).id}/ship`, { id: idOf(cod.number).id, carrier: "rapid-poste", trackingNumber: "RP123456789TN" }, admin)

await call("POST", "/v1/requests", {
  name: "Lina Dupont",
  email: "lina@example.test",
  phone: "+3260000000",
  country: "Belgique",
  description: "Un grand vase à col étroit, émail sable, pour une entrée.",
  dimensions: "40 cm",
  budget: "300",
  locale: "fr",
})
console.info("mails ready:", card.number, cod.number, transfer.number)
