import { expect, test } from "bun:test"
import { scrubBreadcrumb, scrubEvent } from "../src/scrub"

const realistic = () => ({
  message: "mail failed for buyer@example.com, call +216 20 123 456, iban TN5910006035183598478831",
  user: { id: "1", email: "buyer@example.com", ip_address: "41.226.1.2" },
  server_name: "macbook-de-sabri",
  request: {
    method: "POST",
    url: "https://api.ceraghit.tn/rpc/admin/vault/save?token=abc&email=a@b.com",
    headers: {
      authorization: "Bearer sk_live_123456789",
      cookie: "session=zzz",
      "user-agent": "Mozilla",
      "x-request-id": "r1",
    },
    cookies: { session: "zzz" },
    data: { password: "hunter2", konnectKey: "live_abcdefabcdefabcdefabcdefabcdefab" },
    query_string: "token=abc",
  },
  extra: {
    order: {
      number: "CG-2026-0042",
      customer: { email: "a@b.com", phone: "+216 20 123 456", address: "12 rue de Rome" },
    },
  },
  contexts: { os: { name: "Linux" }, secrets: { vault: "v1:AAAA" }, runtime: { name: "bun", version: "1.3" } },
  tags: { job: "retry-mail", contact: "x@y.tn" } as Record<string, string>,
  breadcrumbs: [
    { category: "console", message: "password=hunter2" },
    { category: "fetch", data: { url: "https://api.x/rpc?token=1", body: '{"password":"p"}', status_code: 200 } },
  ],
  exception: {
    values: [
      {
        type: "Error",
        value: "Aramex rejected Authorization: Bearer abcdefghijklmnop for +216 20 123 456",
        stacktrace: { frames: [{ filename: "a.ts", vars: { password: "hunter2" } }] },
      },
    ],
  },
})

test("a realistic server event leaves without credentials or customer data", () => {
  const out = scrubEvent(realistic()) as any
  const json = JSON.stringify(out)
  for (const leaked of [
    "hunter2",
    "buyer@example",
    "a@b.com",
    "x@y.tn",
    "+216",
    "TN5910",
    "sk_live",
    "zzz",
    "Rome",
    "abcdefghijklmnop",
    "macbook",
    "41.226",
    "v1:AAAA",
    "token=abc",
    "live_abcdef",
  ]) {
    expect(json).not.toContain(leaked)
  }
  expect(out.user).toBeUndefined()
  expect(out.request).toEqual({
    method: "POST",
    url: "https://api.ceraghit.tn/rpc/admin/vault/save",
    headers: { "user-agent": "Mozilla", "x-request-id": "r1" },
  })
  expect(out.extra).toBeUndefined()
  expect(out.tags.job).toBe("retry-mail")
  expect(out.breadcrumbs).toEqual([])
  expect(out.exception.values[0]?.stacktrace?.frames[0]).toEqual({ filename: "a.ts" })
})

test("on a public route the order number survives and the customer does not", () => {
  const event = { ...realistic(), request: { method: "GET", url: "https://api.ceraghit.tn/rpc/orders/get" } }
  const out = scrubEvent(event) as any
  const extra = JSON.stringify(out.extra)
  expect(extra).toContain("CG-2026-0042")
  expect(extra).not.toContain("Rome")
  expect(extra).not.toContain("a@b.com")
  expect(out.breadcrumbs).toHaveLength(1)
  expect(JSON.stringify(out.breadcrumbs)).not.toContain("password")
  expect(JSON.stringify(out.breadcrumbs)).not.toContain("token=1")
})

test.each([
  ["NEXT_REDIRECT", "NEXT_REDIRECT;replace;/fr"],
  ["Error", "NEXT_NOT_FOUND"],
  ["Error", "rate limit exceeded"],
  ["TypeError", "Failed to fetch"],
])("known noise %s %s is dropped", (type, value) => {
  expect(scrubEvent({ exception: { values: [{ type, value }] } })).toBeNull()
})

test("a 4xx answer is dropped and a 5xx is kept", () => {
  expect(scrubEvent({ tags: { "http.status": "404" } })).toBeNull()
  expect(scrubEvent({ tags: { "http.status": "502" } })).not.toBeNull()
})

test("a date and an order number are not mistaken for a phone number", () => {
  const out = scrubEvent({ message: "job failed 2026-11-22 order CG-2026-0042" })
  expect(out?.message).toBe("job failed 2026-11-22 order CG-2026-0042")
})

test("typing and console breadcrumbs are dropped", () => {
  expect(scrubBreadcrumb({ category: "ui.input", message: "input#password" })).toBeNull()
  expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull()
})

test("credentials written inside a message are masked and the rest of the text stays", () => {
  const out = scrubEvent({
    message:
      'provider said {"password":"hunter2","note":"ok"} and Authorization: Basic dXNlcjpwYXNz token=abc123 failed',
  }) as { message: string }
  expect(out.message).not.toMatch(/hunter2|dXNlcjpwYXNz|abc123/)
  expect(out.message).toContain("provider said")
  expect(out.message).toContain("failed")
})

test("a thrown object keeps its useful fields but loses nested bodies and nested credentials", () => {
  const out = scrubEvent({
    request: { method: "GET", url: "https://api.ceraghit.tn/rpc/orders/get" },
    extra: {
      __serialized__: {
        message: "provider failed",
        detail: "Bearer abcdefghijklmnop",
        attempts: [{ body: { note: "private delivery instructions" }, status: 502 }],
      },
    },
  }) as { extra: { __serialized__: { message: string; attempts: Record<string, unknown>[] } } }
  const json = JSON.stringify(out.extra)
  expect(json).not.toContain("abcdefghijklmnop")
  expect(json).not.toContain("private delivery")
  expect(out.extra.__serialized__.message).toBe("provider failed")
  expect(out.extra.__serialized__.attempts[0]).toEqual({ status: 502 })
})

test("the api route tag marks an admin failure sensitive even without a request url", () => {
  const out = scrubEvent({ tags: { route: "/rpc/admin/vault/save" }, extra: { __serialized__: { note: "x" } } }) as {
    extra?: unknown
  }
  expect(out.extra).toBeUndefined()
})

test.each([
  ["a failed query", 'Failed query: insert into "orders" values ($1, $2)\nparams: Amira Ben Salah,12 rue de Rome'],
  ["a local phone number", "delivery refused for 20 123 456 and 98765432"],
  ["a connection url", "connect failed postgres://app:npg_s3cr3t@db:5432/shop"],
  ["a url query inside text", "GET https://api.x/orders?customer=Amira failed"],
  ["escaped json and suffixed keys", 'body {\\"password\\":\\"hunter2\\"} secret_access_key=s3cr3t'],
])("%s inside a message leaks nothing", (_name, message) => {
  const out = scrubEvent({ message }) as { message: string }
  expect(out.message).not.toMatch(/Amira|Rome|20 123 456|98765432|s3cr3t|hunter2/)
})
