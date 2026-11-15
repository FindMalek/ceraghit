import type { Db } from "@workspace/db"
import type { AdminAuth } from "./lib/auth"
import type { Mailer } from "./lib/mailer"
import type { PaymentProvider } from "./lib/payments"
import type { Storage } from "./lib/storage"

export type AppEnv = "local" | "preview" | "production"

/** Everything a procedure needs, built once by the api at startup (and by tests with fakes). */
export interface Services {
  db: Db
  payments: PaymentProvider
  mailer: Mailer
  storage: Storage | null
  auth: AdminAuth
  now: () => Date
  config: {
    webUrl: string
    apiPublicUrl: string
    appEnv: AppEnv
    /** "production", "pr-<n>" or "local". */
    deployEnv: string
    secureCookies: boolean
    /** Card payment until the owner saves the payments page in the dashboard (then the DB row wins). */
    onlinePayments: boolean
    /** Bearer token of the daily GitHub job that calls /cron/cleanup-uploads. Unset: the route does not exist. */
    cronSecret?: string
    /** Shared with the web and dashboard proxies: makes the client address they forward trustworthy. */
    proxySecret?: string
    /** The From header of outgoing mail, read by the setup check for a verified sending domain. */
    emailFrom?: string
  }
}

export type Context = Services & {
  headers: Headers
  /** Set by ResponseHeadersPlugin, used for the admin session cookie. */
  resHeaders?: Headers
}

export function createContext(services: Services, headers: Headers): Context {
  return { ...services, headers }
}
