import type { Db } from "@workspace/db"
import type { IntegrationProvider } from "@workspace/sdk"
import type { AdminAuth } from "./lib/auth"
import type { Mailer } from "./lib/mailer"
import type { PaymentProvider } from "./lib/payments"
import type { Keyring } from "./lib/secrets"
import type { Storage } from "./lib/storage"

export type AppEnv = "local" | "preview" | "production"

/** Everything a procedure needs, built once by the api at startup (and by tests with fakes). */
export interface Services {
  db: Db
  payments: PaymentProvider
  mailer: Mailer
  storage: Storage | null
  auth: AdminAuth
  /** Master key of the credentials vault; null when SECRETS_KEY is not set (saving is refused). */
  secrets?: Keyring | null
  now: () => Date
  /** Server hooks; tests pass spies. */
  hooks?: {
    orderShipped?: (orderId: string) => Promise<void>
    shipmentDelivered?: (shipmentId: string) => Promise<void>
    shipmentException?: (shipmentId: string) => Promise<void>
    /** The storefront caches public reads: tell it they changed. */
    catalogChanged?: () => Promise<void>
  }
  /** Tests pass a fake for the Resend domains api. */
  http?: typeof fetch
  /** Waits between mail retries; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>
  config: {
    webUrl: string
    apiPublicUrl: string
    appEnv: AppEnv
    /** "production", "pr-<n>" or "local". */
    deployEnv: string
    secureCookies: boolean
    /** Card payment until the owner saves the payments page in the dashboard (then the DB row wins). */
    onlinePayments: boolean
    /** ARAMEX_FAKE: Aramex calls are answered by the sandbox stand-in (the api refuses it in production). */
    aramexFake?: boolean
    /** KONNECT_BASE_URL / GROQ_BASE_URL: e2e stubs stand in for the providers (the api refuses both in production). */
    konnectBaseUrl?: string
    groqBaseUrl?: string
    /** Bearer token of the daily GitHub job that calls /cron/cleanup-uploads. Unset: the route does not exist. */
    cronSecret?: string
    /** Names the api answers on `POST /cron/<name>`; the dashboard shows the other catalogued jobs as not active yet. */
    cronJobs?: string[]
    /** Shared with the web and dashboard proxies: makes the client address they forward trustworthy. */
    proxySecret?: string
    /** TRUSTED_PROXY_HOPS: proxies in front of the api that append to x-forwarded-for (counted from the right). */
    trustedProxyHops?: number
    /** The From header of outgoing mail, read by the setup check for a verified sending domain. */
    emailFrom?: string
    /** Server only, never sent to a client: reads the sending domain's DNS state. */
    resendApiKey?: string
    /** Production values of provider credentials, used while the owner saved none in the dashboard. */
    envCredentials?: Partial<Record<IntegrationProvider, Record<string, string | undefined>>>
  }
}

export type Context = Services & {
  headers: Headers
  /** Socket address of the caller, when the host exposes it (Bun does, Vercel functions do not). */
  peer?: string
  /** Set by ResponseHeadersPlugin, used for the admin session cookie. */
  resHeaders?: Headers
}

export function createContext(services: Services, headers: Headers, peer?: string): Context {
  return { ...services, headers, peer }
}
