import { expect, test } from "bun:test"
import { serializeCookie } from "../src/lib/cookies"

test("the admin cookie is http only, lax, high priority and secure outside local", () => {
  const cookie = serializeCookie("ceraghit_admin", "t", { expires: new Date(0), secure: true })
  for (const flag of ["HttpOnly", "SameSite=Lax", "Priority=High", "Secure", "Path=/"]) expect(cookie).toContain(flag)
  expect(serializeCookie("x", "t", { expires: new Date(0), secure: false })).not.toContain("Secure")
})
