import { createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { logger } from "@workspace/logger"
import { AdminAuth, assertNoDemoInProduction, createStorage, DemoProvider, KonnectProvider } from "@workspace/orpc"
import { createFakeAramexFetch } from "@workspace/orpc/fake-aramex"
import { assertVaultKeyForRows } from "@workspace/orpc/rotate"
import { parseKeyring } from "@workspace/orpc/secrets"
import { CRON_JOBS } from "./cron"
import { loadEnv } from "./env"
import { startLogger, withRequestLogging } from "./logger"
import { createMailer, mailTransport } from "./mailer"
import { createServer, rememberPeer } from "./server"
import { flushAfter, startTelemetry } from "./telemetry"

const env = loadEnv()
startLogger(env)
const telemetry = startTelemetry(env)
if (!telemetry.enabled && env.APP_ENV === "production") {
  logger.warn("telemetry off: set OPENOBSERVE_URL, OPENOBSERVE_USER and OPENOBSERVE_PASSWORD to ship")
}
if (env.APP_ENV === "production" && env.ARAMEX_FAKE) throw new Error("ARAMEX_FAKE is not allowed in production")
const db = createDb(env.DATABASE_URL, env.DB_POOL_MAX, {
  onSlowQuery: (slow) => logger.warn("slow query", { ms: slow.ms, query: slow.query.slice(0, 300) }),
})

if (env.BOOTSTRAP) {
  await runMigrations(db)
  await seed(db, { demo: env.SEED_DEMO, admin: { email: env.ADMIN_EMAIL ?? "", password: env.ADMIN_PASSWORD ?? "" } })
}

const secrets = parseKeyring(env.SECRETS_KEY, env.SECRETS_KEY_PREVIOUS)
await assertVaultKeyForRows(db, secrets)

const payments =
  env.KONNECT_API_KEY && env.KONNECT_WALLET_ID
    ? new KonnectProvider(env.KONNECT_API_KEY, env.KONNECT_WALLET_ID, env.KONNECT_MODE, undefined, env.KONNECT_BASE_URL)
    : new DemoProvider(env.WEB_URL)

assertNoDemoInProduction({ appEnv: env.APP_ENV, onlinePayments: env.ONLINE_PAYMENTS }, payments)

const fetch = flushAfter(
  telemetry,
  withRequestLogging(
    createServer({
      db,
      payments,
      mailer: createMailer(env),
      storage: createStorage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        publicUrl: env.S3_PUBLIC_URL,
        prefix: env.DEPLOY_ENV.startsWith("pr-") || env.DEPLOY_ENV === "staging" ? `${env.DEPLOY_ENV}/` : "",
      }),
      auth: new AdminAuth(db),
      secrets,
      ...(env.ARAMEX_FAKE ? { http: createFakeAramexFetch() } : {}),
      now: () => new Date(),
      config: {
        webUrl: env.WEB_URL,
        apiPublicUrl: env.API_PUBLIC_URL,
        appEnv: env.APP_ENV,
        deployEnv: env.DEPLOY_ENV,
        secureCookies: env.APP_ENV !== "local",
        onlinePayments: env.ONLINE_PAYMENTS,
        aramexFake: env.ARAMEX_FAKE,
        konnectBaseUrl: env.KONNECT_BASE_URL,
        groqBaseUrl: env.GROQ_BASE_URL,
        cronSecret: env.CRON_SECRET,
        cronJobs: Object.keys(CRON_JOBS),
        proxySecret: env.PROXY_SECRET,
        trustedProxyHops: env.TRUSTED_PROXY_HOPS,
        emailFrom: env.EMAIL_FROM,
        resendApiKey: env.RESEND_API_KEY,
        envCredentials: {
          aramex: {
            userName: env.ARAMEX_USERNAME,
            password: env.ARAMEX_PASSWORD,
            accountNumber: env.ARAMEX_ACCOUNT_NUMBER,
            accountPin: env.ARAMEX_ACCOUNT_PIN,
            accountEntity: env.ARAMEX_ACCOUNT_ENTITY,
            accountCountryCode: env.ARAMEX_ACCOUNT_COUNTRY_CODE,
          },
          konnect: { apiKey: env.KONNECT_API_KEY, walletId: env.KONNECT_WALLET_ID, mode: env.KONNECT_MODE },
        },
      },
    }),
  ),
)

console.info(
  `api (${env.APP_ENV}/${env.DEPLOY_ENV}, payments: ${payments.name}:${payments.mode}, mail: ${mailTransport(env)})`,
)

if (telemetry.enabled) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void telemetry.shutdown())
  }
}

/** Bun serves this default export directly, and Vercel's function entry (api/index.ts) re-exports it. */
export default {
  port: env.PORT,
  hostname: "0.0.0.0",
  fetch: (request: Request, server?: { requestIP?: (request: Request) => { address: string } | null }) => {
    rememberPeer(request, server?.requestIP?.(request)?.address)
    return fetch(request)
  },
}
