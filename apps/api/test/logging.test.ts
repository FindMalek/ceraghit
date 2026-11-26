import { afterAll, beforeAll, expect, test } from "bun:test"
import { logger } from "@workspace/logger"
import { withRequestLogging } from "../src/logger"

const lines: string[] = []
const realWrite = process.stdout.write.bind(process.stdout)

beforeAll(() => {
  logger.configure({ level: "debug", pretty: false, mixin: () => ({ service: "ceraghit-api", env: "test" }) })
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stdout.write
})
afterAll(() => {
  process.stdout.write = realWrite
  logger.configure({ pretty: true })
})

const entries = () =>
  lines
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)

test("a request line is json with level, request id, route, status and duration", async () => {
  lines.length = 0
  const handler = withRequestLogging(async () => new Response("ok", { status: 201 }))
  await handler(
    new Request("http://api.test/v1/orders/CG-2026-0042", { headers: { "x-request-id": "req-1234567890" } }),
  )
  const line = entries().find((entry) => entry.msg === "request")
  expect(line).toMatchObject({
    level: "info",
    service: "ceraghit-api",
    request_id: "req-1234567890",
    method: "GET",
    route: "/:id/orders/:id",
    status: 201,
  })
  expect(typeof line?.ms).toBe("number")
})

test("a failing request never writes credentials or customer details to the logs", async () => {
  lines.length = 0
  const handler = withRequestLogging(async () => {
    throw Object.assign(new Error("konnect said no for buyer@example.com"), {
      authorization: "Bearer sk_live_123456789",
      password: "hunter2",
      customer: { phone: "+216 20 123 456", address: "12 rue de Rome", email: "buyer@example.com" },
    })
  })
  await expect(handler(new Request("http://api.test/rpc/admin/login", { method: "POST" }))).rejects.toThrow()
  const out = lines.join("")
  for (const leaked of ["sk_live_123456789", "hunter2", "+216 20 123 456", "12 rue de Rome", "buyer@example.com"]) {
    expect(out).not.toContain(leaked)
  }
  const line = entries().find((entry) => entry.msg === "request failed")
  expect(line).toMatchObject({ level: "error", route: "/rpc/admin/login" })
  expect(line?.request_id).toBeString()
})
