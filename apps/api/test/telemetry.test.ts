import { expect, test } from "bun:test"
import { loadEnv } from "../src/env"
import { startTelemetry } from "../src/telemetry"

test("without OPENOBSERVE_* the api starts no exporter", () => {
  const telemetry = startTelemetry(loadEnv({ DATABASE_URL: "postgres://x" }))
  expect(telemetry.enabled).toBe(false)
})
