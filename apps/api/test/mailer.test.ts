import { expect, test } from "bun:test"
import { ConsoleMailer, MailpitMailer, RedirectMailer, ResendMailer } from "@workspace/orpc"
import { loadEnv } from "../src/env"
import { createMailer } from "../src/mailer"

const resend = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Ceraghit <commandes@example.com>" }

test("createMailer redirects outside production when MAIL_REDIRECT_TO is set", () => {
  const mailer = createMailer({
    ...resend,
    APP_ENV: "preview",
    DEPLOY_ENV: "pr-42",
    MAIL_REDIRECT_TO: "redirect@example.com",
  })
  expect(mailer).toBeInstanceOf(RedirectMailer)
})

test("createMailer never redirects in production", () => {
  const mailer = createMailer({
    ...resend,
    APP_ENV: "production",
    DEPLOY_ENV: "production",
    MAIL_REDIRECT_TO: "redirect@example.com",
  })
  expect(mailer).not.toBeInstanceOf(RedirectMailer)
})

const local = { APP_ENV: "local", DEPLOY_ENV: "local", EMAIL_FROM: "Ceraghit <commandes@example.com>" } as const

test("outside production mailpit beats resend, then resend, then console", () => {
  const withBoth = createMailer({ ...local, RESEND_API_KEY: "re_test", MAILPIT_URL: "http://localhost:8025" })
  expect(withBoth).toBeInstanceOf(MailpitMailer)
  expect(createMailer({ ...local, RESEND_API_KEY: "re_test" })).toBeInstanceOf(ResendMailer)
  expect(createMailer(local)).toBeInstanceOf(ConsoleMailer)
})

test("production never picks mailpit and the env refuses MAILPIT_URL there", () => {
  const mailer = createMailer({
    ...resend,
    APP_ENV: "production",
    DEPLOY_ENV: "production",
    MAILPIT_URL: "http://localhost:8025",
  })
  expect(mailer).toBeInstanceOf(ResendMailer)
  expect(() =>
    loadEnv({
      DATABASE_URL: "postgres://x",
      APP_ENV: "production",
      DEPLOY_ENV: "production",
      SEED_DEMO: "false",
      ...resend,
      WEB_URL: "https://ceraghit.com",
      API_PUBLIC_URL: "https://api.ceraghit.com",
      S3_ENDPOINT: "https://r2",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "s",
      MAILPIT_URL: "http://localhost:8025",
    }),
  ).toThrow(/MAILPIT_URL/)
})
