import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { AramexClient, buildClientInfo } from "../src/lib/shipping/aramex/client"
import { AramexError } from "../src/lib/shipping/aramex/errors"
import { CREDS } from "./aramex-creds"

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/aramex/${name}.json`, import.meta.url), "utf8")

type Call = { url: string; body: Record<string, unknown> }

function fake(...answers: (string | Error | { status: number; body: string })[]) {
  const calls: Call[] = []
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (answer instanceof Error) throw answer
    if (typeof answer === "string") return new Response(answer, { status: 200 })
    return new Response(answer?.body, { status: answer?.status })
  }) as typeof fetch
  return { calls, http }
}

const client = (http: typeof fetch) =>
  new AramexClient({ host: "https://ws.dev.aramex.net", credentials: CREDS, fetch: http, sleep: async () => {} })

const timeout = () => Object.assign(new Error("timed out"), { name: "TimeoutError" })

describe("aramex client", () => {
  test("sends ClientInfo in PascalCase to the json endpoint, Source omitted when null", async () => {
    const f = fake(fixture("fetch-cities.ok"))
    await client(f.http).fetchCities({ CountryCode: "TN" })
    expect(f.calls[0]?.url).toBe("https://ws.dev.aramex.net/ShippingAPI.V2/Location/Service_1_0.svc/json/FetchCities")
    expect(Object.keys(f.calls[0]?.body.ClientInfo as object).sort()).toEqual([
      "AccountCountryCode",
      "AccountEntity",
      "AccountNumber",
      "AccountPin",
      "Password",
      "PreferredLanguageCode",
      "UserName",
      "Version",
    ])
    expect(buildClientInfo({ ...CREDS, source: 24 }).Source).toBe(24)
  })

  test("HasErrors maps to a French AramexError that never holds a credential", async () => {
    const f = fake(fixture("login-error"))
    const error = await client(f.http)
      .fetchCities({})
      .catch((e) => e)
    expect(error).toBeInstanceOf(AramexError)
    expect(error.code).toBe("ERR75")
    expect(error.message).toContain("Identifiants Aramex refusés")
    expect(`${error.message}${error}${JSON.stringify(error)}`).not.toMatch(/SENTINEL/)
    expect(f.calls).toHaveLength(1)
  })

  test("a provider message echoing the password is redacted", async () => {
    const body = JSON.stringify({ Notifications: [{ Code: "X1", Message: "bad SENTINEL-PASSWORD" }], HasErrors: true })
    const error = await client(fake(body).http)
      .fetchCities({})
      .catch((e) => e)
    expect(error.message).not.toContain("SENTINEL")
  })

  test("raw notifications are redacted too, url-encoded and for known codes, short secrets are left alone", async () => {
    const body = JSON.stringify({
      Notifications: [{ Code: "ERR75", Message: "p%40ss%26word and SENTINEL-PASSWORD" }],
      HasErrors: true,
    })
    const http = fake(body).http
    const odd = new AramexClient({
      host: "https://ws.dev.aramex.net",
      credentials: { ...CREDS, password: "p@ss&word", accountPin: "12" },
      fetch: http,
      sleep: async () => {},
    })
    const error = await odd.fetchCities({}).catch((e) => e)
    expect(JSON.stringify(error.notifications)).not.toContain("p%40ss%26word")
    expect(error.notifications[0].message).toContain("SENTINEL-PASSWORD")
    const short = fake(JSON.stringify({ Notifications: [{ Code: "X", Message: "city 12 unknown" }], HasErrors: true }))
    const e2 = await new AramexClient({
      host: "https://ws.dev.aramex.net",
      credentials: { ...CREDS, accountPin: "12" },
      fetch: short.http,
      sleep: async () => {},
    })
      .fetchCities({})
      .catch((e) => e)
    expect(e2.message).toContain("city 12 unknown")
    const known = await client(
      fake(JSON.stringify({ Notifications: [{ Code: "ERR75", Message: "SENTINEL-PIN" }], HasErrors: true })).http,
    )
      .fetchCities({})
      .catch((e) => e)
    expect(JSON.stringify(known.notifications)).not.toContain("SENTINEL")
  })

  test("a failed shipment inside a HasErrors:false response is still an error", async () => {
    const error = await client(fake(fixture("create-shipments.error")).http)
      .createShipments({ Shipments: [] })
      .catch((e) => e)
    expect(error.code).toBe("ERR61")
  })

  test("an html body is BAD_RESPONSE", async () => {
    const error = await client(fake("<html>Request Error</html>").http)
      .fetchCities({})
      .catch((e) => e)
    expect(error.code).toBe("BAD_RESPONSE")
  })

  test("idempotent calls retry twice on timeout, then fail", async () => {
    const f = fake(timeout())
    const error = await client(f.http)
      .trackShipments({ Shipments: ["1"] })
      .catch((e) => e)
    expect(error.code).toBe("TIMEOUT")
    expect(f.calls).toHaveLength(3)
  })

  test("idempotent calls recover from a 5xx", async () => {
    const f = fake({ status: 503, body: "" }, fixture("track-shipments.ok"))
    const res = await client(f.http).trackShipments({ Shipments: ["44001234567"] })
    expect(res.TrackingResults).toHaveLength(1)
    expect(f.calls).toHaveLength(2)
  })

  test("CreateShipments and CreatePickup are never retried", async () => {
    const f = fake(timeout())
    await client(f.http)
      .createShipments({ Shipments: [] })
      .catch(() => {})
    await client(f.http)
      .createPickup({ Pickup: {} as never })
      .catch(() => {})
    expect(f.calls.map((c) => c.url.split("/").pop())).toEqual(["CreateShipments"])
  })

  test("unknown response fields survive and null arrays become empty", async () => {
    const res = await client(fake('{"HasErrors":false,"Notifications":null,"Cities":null,"New":1}').http).fetchCities(
      {},
    )
    expect(res.Cities).toEqual([])
    expect((res as Record<string, unknown>).New).toBe(1)
  })
})
