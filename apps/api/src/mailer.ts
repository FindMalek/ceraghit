import { ConsoleMailer, type Mailer, RedirectMailer, ResendMailer } from "@workspace/orpc"
import type { Env } from "./env"

type MailerEnv = Pick<Env, "APP_ENV" | "DEPLOY_ENV" | "RESEND_API_KEY" | "EMAIL_FROM" | "MAIL_REDIRECT_TO">

/** Every transport passes through here so the non production redirect can never be skipped. */
export function createMailer(env: MailerEnv): Mailer {
  const transport = env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new ConsoleMailer()
  if (env.APP_ENV === "production" || !env.MAIL_REDIRECT_TO) return transport
  return new RedirectMailer(transport, env.MAIL_REDIRECT_TO, env.DEPLOY_ENV)
}
