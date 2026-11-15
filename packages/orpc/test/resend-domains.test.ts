import { describe, expect, test } from "bun:test"
import { createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import type { Services } from "../src/context"
import { loadEmailDomain } from "../src/lib/email-domain"
import { emailDomainState, getDomain } from "../src/lib/resend-domains"

const record = (record: string, status: string) => ({
  record,
  name: record === "SPF" ? "send" : "resend._domainkey",
  type: record === "SPF" ? "MX" : "TXT",
  ttl: "Auto",
  status,
  value: "feedback-smtp.eu-west-1.amazonses.com",
  priority: record === "SPF" ? 10 : undefined,
})

const json = (body: unknown, status = 200) => Response.json(body, { status })

/** Answers the Resend domains api like the docs show. */
function fakeResend(opts: { status: string; dkim: string; list?: unknown[]; code?: number }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const path = String(input)
    if (opts.code) return json({ message: "restricted" }, opts.code)
    if (path.endsWith("/domains"))
      return json({ object: "list", data: opts.list ?? [{ id: "d1", name: "ceraghit.com", status: opts.status }] })
    return json({
      object: "domain",
      id: "d1",
      name: "ceraghit.com",
      status: opts.status,
      extra: "ignored",
      records: [record("SPF", "verified"), record("DKIM", opts.dkim)],
    })
  }) as typeof fetch
}

const url = process.env.DATABASE_URL

describe.skipIf(!url)("resend domains", () => {
  const db = createDb(url!)
  const services = (http: typeof fetch): Services => ({
    db,
    payments: null as never,
    mailer: { send: async () => ({ id: null }) },
    storage: null,
    auth: null as never,
    now: () => new Date(),
    http,
    config: {
      webUrl: "https://web.test",
      apiPublicUrl: "https://api.test",
      appEnv: "production",
      deployEnv: "production",
      secureCookies: true,
      onlinePayments: false,
      emailFrom: "Ceraghit <commandes@ceraghit.com>",
      resendApiKey: "re_secret_key_value",
    },
  })

  test("a verified domain maps its records", async () => {
    await runMigrations(db)
    const res = await loadEmailDomain(services(fakeResend({ status: "verified", dkim: "verified" })))
    expect(res.state).toBe("verified")
    expect(res.records.map((r) => [r.purpose, r.status])).toEqual([
      ["SPF", "verified"],
      ["DKIM", "verified"],
    ])
    expect(JSON.stringify(res)).not.toContain("re_secret_key_value")
  })

  test("a pending domain lists the records still to add", async () => {
    const res = await loadEmailDomain(services(fakeResend({ status: "pending", dkim: "not_started" })))
    expect(res.state).toBe("pending")
    expect(res.records.find((r) => r.purpose === "DKIM")?.status).toBe("not_started")
    expect(res.dmarc?.name).toBe("_dmarc.ceraghit.com")
  })

  test("a 401 is a restricted key, not a crash", async () => {
    const res = await loadEmailDomain(services(fakeResend({ status: "", dkim: "", code: 401 })))
    expect(res.state).toBe("restricted_key")
    expect(res.records).toEqual([])
  })

  test("a domain missing from the account is not_found", async () => {
    const res = await loadEmailDomain(services(fakeResend({ status: "", dkim: "", list: [] })))
    expect(res.state).toBe("not_found")
  })

  test("failed and temporary_failure are failed", () => {
    expect(emailDomainState({ status: "failed" })).toBe("failed")
    expect(emailDomainState({ status: "temporary_failure" })).toBe("failed")
    expect(emailDomainState({ status: "not_started" })).toBe("pending")
  })

  test("getDomain answers restricted_key on 403", async () => {
    expect(await getDomain("k", "d1", fakeResend({ status: "", dkim: "", code: 403 }))).toEqual({
      kind: "restricted_key",
    })
  })
})
