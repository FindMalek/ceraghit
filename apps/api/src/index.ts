import { createDb } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { AdminAuth, ConsoleMailer, createStorage, DemoProvider, KonnectProvider, ResendMailer } from "@workspace/orpc"
import { loadEnv } from "./env"
import { createServer } from "./server"

const env = loadEnv()
const db = createDb(env.DATABASE_URL, env.DB_POOL_MAX)

if (env.BOOTSTRAP) {
  await runMigrations(db)
  await seed(db, { demo: env.SEED_DEMO, admin: { email: env.ADMIN_EMAIL ?? "", password: env.ADMIN_PASSWORD ?? "" } })
}

const payments =
  env.KONNECT_API_KEY && env.KONNECT_WALLET_ID
    ? new KonnectProvider(env.KONNECT_API_KEY, env.KONNECT_WALLET_ID, env.KONNECT_MODE)
    : new DemoProvider(env.WEB_URL)

const fetch = createServer({
  db,
  payments,
  mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new ConsoleMailer(),
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
  now: () => new Date(),
  config: {
    webUrl: env.WEB_URL,
    apiPublicUrl: env.API_PUBLIC_URL,
    appEnv: env.APP_ENV,
    deployEnv: env.DEPLOY_ENV,
    secureCookies: env.APP_ENV !== "local",
  },
})

console.info(`api (${env.APP_ENV}/${env.DEPLOY_ENV}, payments: ${payments.name}:${payments.mode})`)

/** Bun serves this default export directly, and Vercel's function entry (api/index.ts) re-exports it. */
export default { port: env.PORT, hostname: "0.0.0.0", fetch }
