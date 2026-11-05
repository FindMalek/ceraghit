import { expect, test } from "bun:test"
import { loadEnv } from "./env"

const base = { DATABASE_URL: "postgres://x" }
const production = {
  ...base,
  APP_ENV: "production",
  DEPLOY_ENV: "production",
  SEED_DEMO: "false",
  KONNECT_MODE: "live",
  KONNECT_API_KEY: "k",
  KONNECT_WALLET_ID: "w",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Ceraghit <commandes@ceraghit.com>",
  WEB_URL: "https://ceraghit.com",
  API_PUBLIC_URL: "https://api.ceraghit.com",
  S3_ENDPOINT: "https://r2",
  S3_BUCKET: "b",
  S3_ACCESS_KEY_ID: "a",
  S3_SECRET_ACCESS_KEY: "s",
}

test("live payment keys are refused outside production", () => {
  expect(() => loadEnv({ ...base, APP_ENV: "preview", KONNECT_MODE: "live" })).toThrow(/APP_ENV=production/)
})

test("production refuses test mode, demo seed and a missing bucket", () => {
  expect(() => loadEnv({ ...production, KONNECT_MODE: "test" })).toThrow(/live/)
  expect(() => loadEnv({ ...production, BOOTSTRAP: "true", SEED_DEMO: "true" })).toThrow(/demo/)
  expect(() => loadEnv({ ...production, S3_BUCKET: "" })).toThrow(/S3_/)
})

test("production refuses localhost urls and the test email sender", () => {
  const { WEB_URL: _web, ...withoutWebUrl } = production
  expect(() => loadEnv(withoutWebUrl)).toThrow(/WEB_URL/)
  expect(() => loadEnv({ ...production, API_PUBLIC_URL: "http://api.ceraghit.com" })).toThrow(/API_PUBLIC_URL/)
  expect(() => loadEnv({ ...production, EMAIL_FROM: "Ceraghit <onboarding@resend.dev>" })).toThrow(/EMAIL_FROM/)
})

test("a complete production env boots without bootstrapping", () => {
  const env = loadEnv(production)
  expect(env.BOOTSTRAP).toBe(false)
})
