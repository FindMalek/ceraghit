import { describe, expect, test } from "bun:test"
import { buildCorsPlan } from "../src/lib/tutorial-cors"

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
    expect(plan.wrangler.rules[1]).toEqual({
      allowed: { origins: [input.dashboardOrigin], methods: ["GET", "HEAD"] },
      maxAgeSeconds: 3600,
    })
    expect(JSON.stringify(plan)).not.toContain('"*"')
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
