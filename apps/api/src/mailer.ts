import { ConsoleMailer, type Mailer, MailpitMailer, RedirectMailer, ResendMailer } from "@workspace/orpc"
import type { Env } from "./env"

type MailerEnv = Pick<
  Env,
  "APP_ENV" | "DEPLOY_ENV" | "RESEND_API_KEY" | "EMAIL_FROM" | "MAIL_REDIRECT_TO" | "MAILPIT_URL"
>

export type MailTransport = "resend" | "mailpit" | "console"

/** Production only ever uses Resend. Elsewhere a catcher beats Resend so local and previews can read every body. */
export function mailTransport(env: MailerEnv): MailTransport {
  if (env.APP_ENV === "production") return env.RESEND_API_KEY ? "resend" : "console"
  if (env.MAILPIT_URL) return "mailpit"
  return env.RESEND_API_KEY ? "resend" : "console"
}

/** Every transport passes through here so the non production redirect can never be skipped. */
export function createMailer(env: MailerEnv): Mailer {
  const kind = mailTransport(env)
  const transport =
    kind === "resend" && env.RESEND_API_KEY
      ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
      : kind === "mailpit" && env.MAILPIT_URL
        ? new MailpitMailer(env.MAILPIT_URL, env.EMAIL_FROM)
        : new ConsoleMailer()
  if (env.APP_ENV === "production" || !env.MAIL_REDIRECT_TO) return transport
  return new RedirectMailer(transport, env.MAIL_REDIRECT_TO, env.DEPLOY_ENV)
}
