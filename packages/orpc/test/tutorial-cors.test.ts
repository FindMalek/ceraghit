import { describe, expect, test } from "bun:test"
import { buildCorsPlan, runCorsChecks } from "../src/lib/tutorial-cors"

const input = {
  bucket: "ceraghit-prod",
  dashboardOrigin: "https://dashboard.ceraghit.com",
  webOrigin: "https://ceraghit.com",
  cdnUrl: "https://cdn.ceraghit.com/",
}

describe("buildCorsPlan", () => {
  test("PUT from both origins, GET and HEAD from the dashboard only, in both formats", () => {
    const plan = buildCorsPlan(input)
    const [put, read] = plan.s3.CORSRules
    expect(put).toMatchObject({ AllowedOrigins: [input.webOrigin, input.dashboardOrigin], AllowedMethods: ["PUT"] })
    expect(read).toMatchObject({ AllowedOrigins: [input.dashboardOrigin], AllowedMethods: ["GET", "HEAD"] })
    expect(plan.wrangler.rules[1]).toMatchObject({
      allowed: { origins: [input.dashboardOrigin], methods: ["GET", "HEAD"] },
    })
    expect(JSON.stringify(plan)).not.toContain('"*"')
  })

  test("the GET rule allows the Range header and exposes the range response headers", () => {
    const read = buildCorsPlan(input).s3.CORSRules[1]
    expect(read).toMatchObject({ AllowedHeaders: ["range"] })
    expect(read?.ExposeHeaders).toEqual(["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"])
    expect(buildCorsPlan(input).wrangler.rules[1]).toMatchObject({ allowed: { headers: ["range"] } })
  })

  test("the check passes on a bucket that answers like the rules and fails on a bare one", () => {
    const answers = (args: string[]) => {
      const origin = args.find((a) => a.startsWith("Origin: "))?.slice(8)
      if (origin !== input.dashboardOrigin) return "HTTP/2 200\r\n"
      const pre = args.includes("OPTIONS")
        ? "access-control-allow-methods: GET, HEAD\r\naccess-control-allow-headers: range\r\n"
        : ""
      return `HTTP/2 200\r\naccess-control-allow-origin: ${origin}\r\n${pre}`
    }
    expect(runCorsChecks(input, answers).every((c) => c.ok)).toBe(true)
    const bare = runCorsChecks(input, () => "HTTP/2 200\r\n")
    expect(bare.filter((c) => !c.ok).map((c) => c.name)).toContain("dashboard preflight GET with Range")
    const open = runCorsChecks(input, () => "access-control-allow-origin: https://evil.example\r\n")
    expect(open.find((c) => c.name === "foreign origin refused")?.ok).toBe(false)
  })

  test("the verify commands probe the CDN with the dashboard origin and a foreign one", () => {
    const { verify, apply } = buildCorsPlan(input)
    expect(verify[0]).toContain('-H "Origin: https://dashboard.ceraghit.com"')
    expect(verify[0]).toContain("https://cdn.ceraghit.com/tutorials/manifest.json")
    expect(verify[1]).toContain("https://evil.example")
    expect(apply.join("\n")).toContain("wrangler r2 bucket cors set ceraghit-prod")
  })

  test("wildcards, paths and plain http origins are refused", () => {
    for (const bad of [
      "*",
      "https://*.ceraghit.com",
      "https://dashboard.ceraghit.com/",
      "http://dashboard.ceraghit.com",
    ])
      expect(() => buildCorsPlan({ ...input, dashboardOrigin: bad })).toThrow()
  })
})
