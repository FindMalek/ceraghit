import { expect, test } from "bun:test"
import type { Services } from "@workspace/orpc"
import { createServer } from "../src/server"

const services = {
  config: { webUrl: "https://web.test", apiPublicUrl: "https://api.test", appEnv: "local", deployEnv: "test" },
} as Services
const fetch = createServer(services)

for (const path of ["/nope", "/v1/nope", "/rpc/nope", "/cron/cleanup-uploads"]) {
  test(`unknown path ${path} answers a JSON 404`, async () => {
    const response = await fetch(new Request(`https://api.test${path}`))
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toEqual({ message: "Not found." })
  })
}
