import { expect, test } from "bun:test"
import { assertSafe, envProblems } from "../lib/guard"

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
  const live = (async () => Response.json({ payments: "konnect:live" })) as unknown as typeof fetch
  await expect(assertSafe(local, live)).rejects.toThrow("not the demo gateway")
  const demo = (async () => Response.json({ payments: "demo:test" })) as unknown as typeof fetch
  await expect(assertSafe(local, demo)).resolves.toBeUndefined()
})
