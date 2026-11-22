import { expect, test } from "bun:test"
import { clientAddress } from "../src/lib/rate-limit"

const secret = "s".repeat(32)
const signed = { "x-ceraghit-client-ip": "203.0.113.7", "x-ceraghit-proxy-secret": secret }
const via = (forwardedFor: string, headers: Record<string, string> = {}) =>
  new Headers({ "x-forwarded-for": forwardedFor, ...headers })

test("a client supplied x-forwarded-for is ignored when no proxy is trusted", () => {
  expect(clientAddress(via("6.6.6.6"), {}, "10.0.0.9")).toBe("10.0.0.9")
  expect(clientAddress(via("6.6.6.6", { "x-real-ip": "7.7.7.7" }), { proxySecret: secret }, "10.0.0.9")).toBe(
    "10.0.0.9",
  )
  expect(clientAddress(via("6.6.6.6"))).toBe("unknown")
})

test("the signed client address is honoured only with the right secret", () => {
  expect(clientAddress(via("6.6.6.6", signed), { proxySecret: secret }, "10.0.0.9")).toBe("203.0.113.7")
  const wrong = { ...signed, "x-ceraghit-proxy-secret": "wrong".repeat(8) }
  expect(clientAddress(via("6.6.6.6", wrong), { proxySecret: secret }, "10.0.0.9")).toBe("10.0.0.9")
  expect(clientAddress(via("6.6.6.6", signed), {}, "10.0.0.9")).toBe("10.0.0.9")
})

test("trusted hops take the entry our own edge appended, counted from the right", () => {
  const chain = via("6.6.6.6, 198.51.100.4, 10.1.1.1")
  expect(clientAddress(chain, { trustedProxyHops: 1 }, "10.0.0.9")).toBe("10.1.1.1")
  expect(clientAddress(chain, { trustedProxyHops: 2 }, "10.0.0.9")).toBe("198.51.100.4")
  expect(clientAddress(chain, { trustedProxyHops: 4 }, "10.0.0.9")).toBe("10.0.0.9")
})

test("locally the forwarded address is honoured", () => {
  expect(clientAddress(via("203.0.113.9"), { trustForwardedFor: true }, "127.0.0.1")).toBe("203.0.113.9")
})
