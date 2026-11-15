import { expect, test } from "bun:test"
import type { Services } from "@workspace/orpc"
import { createServer } from "../src/server"

function setup(selectThrows = false) {
  const state = { selects: 0 }
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => (selectThrows ? Promise.reject(new Error("db down")) : Promise.resolve([])),
  }
  const services = {
    db: {
      select: () => {
        state.selects++
        return chain
      },
    },
    payments: { name: "demo", mode: "test" },
    storage: null,
    now: () => new Date(),
    config: { webUrl: "http://w", apiPublicUrl: "http://a", appEnv: "local", deployEnv: "local", secureCookies: false },
  } as unknown as Services
  return { fetch: createServer(services), state }
}

const hit = (fetch: (r: Request) => Promise<Response>, path: string, method = "GET") =>
  fetch(new Request(`http://api.test${path}`, { method }))

test("GET and POST with a valid ref settle once each and answer 200", async () => {
  const { fetch, state } = setup()
  for (const method of ["GET", "POST"]) {
    const res = await hit(fetch, "/webhooks/konnect?payment_ref=abc_123-X", method)
    expect(res.status).toBe(200)
  }
  expect(state.selects).toBe(2)
})

test("a missing, oversized or malformed ref answers 200 without touching the db", async () => {
  const { fetch, state } = setup()
  for (const path of [
    "/webhooks/konnect",
    `/webhooks/konnect?payment_ref=${"a".repeat(101)}`,
    "/webhooks/konnect?payment_ref=a%20b%27%3B--",
  ]) {
    expect((await hit(fetch, path)).status).toBe(200)
  }
  expect(state.selects).toBe(0)
})

test("a failing settle still answers 200", async () => {
  const { fetch, state } = setup(true)
  const res = await hit(fetch, "/webhooks/konnect?payment_ref=abc", "POST")
  expect(res.status).toBe(200)
  expect(state.selects).toBe(1)
})
