import { expect, test } from "bun:test"
import * as Sentry from "@sentry/node"
import { initNode } from "../src/node"
import { glitchtipIssues, glitchtipOrigin, resolveGlitchtip } from "../src/config"
import { errorsEnabled, reportError } from "../src/index"

const DSN = "https://publickey@errors.example.com/7"

test("no DSN: nothing resolves", () => {
  expect(resolveGlitchtip({ APP_ENV: "production" })).toBeNull()
})

test("APP_ENV=local never starts, even with a DSN", () => {
  expect(resolveGlitchtip({ APP_ENV: "local", GLITCHTIP_DSN: DSN })).toBeNull()
  expect(resolveGlitchtip({ GLITCHTIP_DSN: DSN })).toBeNull()
})

test("a production project is refused anywhere but production", () => {
  expect(glitchtipIssues({ APP_ENV: "preview", GLITCHTIP_DSN: DSN, GLITCHTIP_ENV: "production" })).toHaveLength(2)
  expect(glitchtipIssues({ APP_ENV: "local", GLITCHTIP_ENV: "production" })).toHaveLength(1)
  expect(glitchtipIssues({ APP_ENV: "production", GLITCHTIP_DSN: DSN })).toHaveLength(1)
  expect(resolveGlitchtip({ APP_ENV: "preview", GLITCHTIP_DSN: DSN, GLITCHTIP_ENV: "production" })).toBeNull()
})

test("a matching setup resolves with environment and release", () => {
  expect(
    resolveGlitchtip({ APP_ENV: "production", GLITCHTIP_DSN: DSN, GLITCHTIP_ENV: "production", GIT_SHA: "abc123" }),
  ).toEqual({ dsn: DSN, environment: "production", release: "abc123", sampleRate: 1 })
})

test("the CSP origin only exists for a usable DSN", () => {
  expect(glitchtipOrigin(DSN)).toBe("https://errors.example.com")
  expect(glitchtipOrigin("nonsense")).toBeNull()
  expect(glitchtipOrigin(undefined)).toBeNull()
})

test("without a DSN the SDK is not initialised and reportError is a no-op", () => {
  expect(initNode({ APP_ENV: "production" }, "ceraghit-api")).toBe(false)
  expect(initNode({ APP_ENV: "local", GLITCHTIP_DSN: DSN, GLITCHTIP_ENV: "preview" }, "ceraghit-api")).toBe(false)
  expect(Sentry.getClient()).toBeUndefined()
  expect(errorsEnabled()).toBe(false)
  expect(reportError(new Error("x"))).toBeUndefined()
})

test("with a matching DSN the SDK starts with pii off", async () => {
  const env = { APP_ENV: "preview", GLITCHTIP_DSN: "https://k@127.0.0.1:9/1", GLITCHTIP_ENV: "preview" }
  expect(initNode(env, "ceraghit-api")).toBe(true)
  const options = Sentry.getClient()?.getOptions()
  expect(options?.environment).toBe("preview")
  expect((options as { sendDefaultPii?: boolean } | undefined)?.sendDefaultPii).toBe(false)
  expect(errorsEnabled()).toBe(true)
  await Sentry.close(0)
})
