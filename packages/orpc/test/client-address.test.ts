import { expect, test } from "bun:test"
import { clientAddress } from "../src/lib/rate-limit"

const secret = "s".repeat(32)
const via = (headers: Record<string, string>) => new Headers({ "x-forwarded-for": "10.0.0.9", ...headers })

test("the forwarded client address is trusted only with the right proxy secret", () => {
  const forwarded = { "x-ceraghit-client-ip": "203.0.113.7" }
  expect(clientAddress(via({ ...forwarded, "x-ceraghit-proxy-secret": secret }), secret)).toBe("203.0.113.7")
  expect(clientAddress(via({ ...forwarded, "x-ceraghit-proxy-secret": "wrong".repeat(8) }), secret)).toBe("10.0.0.9")
  expect(clientAddress(via(forwarded), secret)).toBe("10.0.0.9")
  expect(clientAddress(via({ ...forwarded, "x-ceraghit-proxy-secret": secret }))).toBe("10.0.0.9")
})
