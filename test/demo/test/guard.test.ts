import { expect, test } from "bun:test"
import { assertAdminCredentials, assertSafe, envProblems } from "../lib/guard"

const local = {
  APP_ENV: "local",
  DATABASE_URL: "postgres://u:p@localhost:5435/ceraghit",
  MAIL_REDIRECT_TO: "me@example.test",
}

test("a non local database and a missing mail redirect are refused", async () => {
  expect(envProblems(local)).toEqual([])
  expect(envProblems({ ...local, DATABASE_URL: "postgres://u:p@db.neon.tech/ceraghit" }).join()).toContain("localhost")
  expect(envProblems({ ...local, MAIL_REDIRECT_TO: "" }).join()).toContain("MAIL_REDIRECT_TO")
  expect(envProblems({ ...local, APP_ENV: "production" }).join()).toContain("APP_ENV")
})

test("a live payment gateway is refused", async () => {
  const live = (async () => Response.json({ payments: "gateway:live" })) as unknown as typeof fetch
  await expect(assertSafe(local, live)).rejects.toThrow("not the demo gateway")
  const demo = (async () => Response.json({ payments: "demo:test" })) as unknown as typeof fetch
  await expect(assertSafe(local, demo)).resolves.toBeUndefined()
})

test("web, dashboard and api urls must be loopback hosts, however they are disguised", () => {
  for (const name of ["WEB_URL", "DASHBOARD_URL", "API_URL"]) {
    for (const bad of [
      "https://admin.ceraghit.com",
      "http://localhost@evil.com",
      "http://localhost.evil.com:3100",
      "http://evil.com/localhost",
    ]) {
      const problems = envProblems({ ...local, [name]: bad }).join()
      expect(problems).toContain(name)
    }
    for (const ok of ["http://localhost:3000", "http://127.0.0.1:3100/login"]) {
      expect(envProblems({ ...local, [name]: ok })).toEqual([])
    }
  }
})

test("a production dashboard url stops the run before any request", async () => {
  const fetchFn = (async () => {
    throw new Error("must not be called")
  }) as unknown as typeof fetch
  await expect(assertSafe({ ...local, DASHBOARD_URL: "https://admin.ceraghit.com" }, fetchFn)).rejects.toThrow(
    "DASHBOARD_URL",
  )
})

test("a logged in video without admin credentials is refused", () => {
  expect(() => assertAdminCredentials({ ADMIN_EMAIL: "a@b.test" })).toThrow("ADMIN_PASSWORD")
  expect(() => assertAdminCredentials({ ADMIN_EMAIL: "a@b.test", ADMIN_PASSWORD: "x" })).not.toThrow()
})
