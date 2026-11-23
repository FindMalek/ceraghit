import { expect, test } from "bun:test"
import { startNextErrors } from "../src/next"

const DSN = "https://publickey@errors.example.com/7"

test("a Next server does not start GlitchTip without a DSN", () => {
  expect(startNextErrors("ceraghit-web", { APP_ENV: "production" })).toBe(false)
  expect(startNextErrors("ceraghit-web", { APP_ENV: "local", NEXT_PUBLIC_GLITCHTIP_DSN: DSN })).toBe(false)
})

test("a browser DSN declared for production is refused on a preview, before any page is served", () => {
  const env = { APP_ENV: "preview", NEXT_PUBLIC_GLITCHTIP_DSN: DSN, NEXT_PUBLIC_GLITCHTIP_ENV: "production" }
  expect(() => startNextErrors("ceraghit-web", env)).toThrow(/NEXT_PUBLIC_GLITCHTIP_ENV=production/)
})
