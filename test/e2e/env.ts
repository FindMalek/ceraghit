import { fileURLToPath } from "node:url"

const num = (name: string, fallback: number): number => Number(process.env[name] ?? fallback)
const str = (name: string, fallback: string): string => process.env[name] || fallback

const webPort = num("E2E_WEB_PORT", 3000)
const dashboardPort = num("E2E_DASHBOARD_PORT", 3100)
const apiPort = num("E2E_API_PORT", 3001)
const dbPort = num("E2E_DB_PORT", 5436)
const s3Port = num("E2E_S3_PORT", 9100)
const mailUiPort = num("E2E_MAILPIT_UI_PORT", 8025)
const mailSmtpPort = num("E2E_MAILPIT_SMTP_PORT", 1025)
const stubPort = num("E2E_STUB_PORT", 9300)

/** `docker compose down -v` runs on this project, so it must never be the dev project (`ceraghit`). */
function composeProject(): string {
  const name = str("E2E_COMPOSE_PROJECT", "ceraghit-e2e")
  if (!name.startsWith("ceraghit-e2e"))
    throw new Error(`E2E_COMPOSE_PROJECT must start with "ceraghit-e2e", got "${name}"`)
  return name
}

/** Everything the e2e stack needs. Test-only values, never real secrets. Every one can be overridden from the shell. */
export const E2E = {
  repoRoot: fileURLToPath(new URL("../../", import.meta.url)),
  composeFile: fileURLToPath(new URL("./docker-compose.e2e.yml", import.meta.url)),
  composeProject: composeProject(),
  ports: {
    web: webPort,
    dashboard: dashboardPort,
    api: apiPort,
    db: dbPort,
    s3: s3Port,
    mailUi: mailUiPort,
    mailSmtp: mailSmtpPort,
    stub: stubPort,
  },
  stubUrl: `http://localhost:${stubPort}`,
  databaseUrl: `postgres://ceraghit:ceraghit@localhost:${dbPort}/ceraghit_e2e`,
  webUrl: `http://localhost:${webPort}`,
  dashboardUrl: `http://localhost:${dashboardPort}`,
  apiUrl: `http://localhost:${apiPort}`,
  adminEmail: str("E2E_ADMIN_EMAIL", "owner@e2e.local"),
  adminPassword: str("E2E_ADMIN_PASSWORD", "e2e-owner-password"),
  cronSecret: "e2e-cron-secret-0123456789abcdef",
  s3: {
    endpoint: `http://localhost:${s3Port}`,
    bucket: "ceraghit-e2e",
    region: "us-east-1",
    accessKeyId: "GK0123456789abcdef01234567",
    secretAccessKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  mailpitUrl: `http://localhost:${mailUiPort}`,
  ownerState: fileURLToPath(new URL("./artifacts/.auth/owner.json", import.meta.url)),
  artifacts: fileURLToPath(new URL("./artifacts/", import.meta.url)),
} as const

// support/mailpit.ts reads MAILPIT_URL, so the helper talks to the e2e catcher and never the dev one.
process.env.MAILPIT_URL = E2E.mailpitUrl

const PROXY_SECRET = "e2e-proxy-secret-0123456789abcdef"

/** Environment of the api process. Konnect and Resend stay empty so the demo gateway and the Mailpit catcher are used. */
export function apiEnv(): Record<string, string> {
  return {
    APP_ENV: "local",
    DEPLOY_ENV: "local",
    PORT: String(E2E.ports.api),
    DATABASE_URL: E2E.databaseUrl,
    WEB_URL: E2E.webUrl,
    API_PUBLIC_URL: E2E.apiUrl,
    BOOTSTRAP: "false",
    ONLINE_PAYMENTS: "true",
    ADMIN_EMAIL: E2E.adminEmail,
    ADMIN_PASSWORD: E2E.adminPassword,
    CRON_SECRET: E2E.cronSecret,
    PROXY_SECRET,
    SECRETS_KEY: `1:${Buffer.alloc(32, 7).toString("base64")}`,
    KONNECT_API_KEY: "",
    KONNECT_WALLET_ID: "",
    RESEND_API_KEY: "",
    MAIL_REDIRECT_TO: "",
    MAILPIT_URL: `http://localhost:${E2E.ports.mailUi}`,
    S3_ENDPOINT: E2E.s3.endpoint,
    S3_BUCKET: E2E.s3.bucket,
    S3_REGION: E2E.s3.region,
    S3_ACCESS_KEY_ID: E2E.s3.accessKeyId,
    S3_SECRET_ACCESS_KEY: E2E.s3.secretAccessKey,
    S3_PUBLIC_URL: "",
    ARAMEX_FAKE: "true",
    KONNECT_BASE_URL: `http://localhost:${stubPort}/konnect`,
    GROQ_BASE_URL: `http://localhost:${stubPort}/groq/openai/v1`,
  }
}

/** Environment of both Next apps: they only need to know where the api and the storefront live. */
export function nextEnv(): Record<string, string> {
  return {
    APP_ENV: "local",
    API_URL: E2E.apiUrl,
    WEB_URL: E2E.webUrl,
    PROXY_SECRET,
    S3_ENDPOINT: E2E.s3.endpoint,
    NEXT_TELEMETRY_DISABLED: "1",
  }
}
