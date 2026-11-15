import { expect, test } from "bun:test"
import { RedirectMailer } from "@workspace/orpc"
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
