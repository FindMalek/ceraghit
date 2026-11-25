import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import type { Page } from "@playwright/test"
import { apiEnv, E2E } from "../../env"
import { expect, test } from "../../fixtures"

const ONCE = { tag: ["@fr", "@desktop"] }
const API_DIR = `${E2E.repoRoot}apps/api`
/** Own port so the api the suite runs against is never touched. */
const SPARE_PORT = E2E.ports.api + 500
const RESEND_KEY = "re_e2e_not_a_real_key"

/** A clean environment: the Playwright process carries test-only variables (MAILPIT_URL) that must not leak in. */
function cleanEnv(extra: Record<string, string>): Record<string, string> {
  return { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...extra }
}

function previewEnv(extra: Record<string, string> = {}): Record<string, string> {
  return cleanEnv({ ...apiEnv(), APP_ENV: "preview", DEPLOY_ENV: "preview", PORT: String(SPARE_PORT), ...extra })
}

/** A production env that boots: each guard case flips one thing in it. */
function productionEnv(extra: Record<string, string> = {}): Record<string, string> {
  return cleanEnv({
    ...apiEnv(),
    APP_ENV: "production",
    DEPLOY_ENV: "production",
    PORT: String(SPARE_PORT),
    ONLINE_PAYMENTS: "false",
    BOOTSTRAP: "false",
    SEED_DEMO: "false",
    PROXY_SECRET: "e2e-proxy-secret-0123456789abcdef",
    RESEND_API_KEY: RESEND_KEY,
    EMAIL_FROM: "Ceraghit <shop@ceraghit.example>",
    WEB_URL: "https://ceraghit.example",
    API_PUBLIC_URL: "https://api.ceraghit.example",
    MAILPIT_URL: "",
    MAIL_REDIRECT_TO: "",
    // the suite's stand-in hosts, refused in production
    KONNECT_BASE_URL: "",
    GROQ_BASE_URL: "",
    ...extra,
  })
}

function boot(env: Record<string, string>): { code: number | null; output: string } {
  const res = spawnSync("bun", ["src/index.ts"], { cwd: API_DIR, env, encoding: "utf8", timeout: 20_000 })
  return { code: res.status, output: `${res.stdout}${res.stderr}` }
}

/** Puts the evidence on a page so the step screenshot shows what the api answered. */
async function show(page: Page, title: string, body: string): Promise<void> {
  const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  await page.setContent(
    `<body style="font:15px monospace;padding:24px"><h3>${esc(title)}</h3><pre>${esc(body.slice(0, 1500))}</pre></body>`,
  )
}

const REFUSED = [
  {
    name: "a live Konnect mode outside production",
    env: () => previewEnv({ KONNECT_MODE: "live" }),
    message: "live payment keys are only allowed with APP_ENV=production",
  },
  {
    name: "demo data seeded in production",
    env: () => productionEnv({ SEED_DEMO: "true", BOOTSTRAP: "true" }),
    message: "production must not seed demo data",
  },
  {
    name: "MAIL_REDIRECT_TO in production",
    env: () => productionEnv({ MAIL_REDIRECT_TO: "owner@ceraghit.example" }),
    message: "MAIL_REDIRECT_TO is not allowed in production",
  },
  {
    name: "the Mailpit catcher in production",
    env: () => productionEnv({ MAILPIT_URL: "http://localhost:8025" }),
    message: "MAILPIT_URL is not allowed in production",
  },
  {
    name: "no R2 bucket in production",
    env: () => productionEnv({ S3_ENDPOINT: "", S3_BUCKET: "" }),
    message: "production needs the R2 S3_* settings",
  },
  {
    name: "no proxy secret in production",
    env: () => productionEnv({ PROXY_SECRET: "" }),
    message: "production needs PROXY_SECRET",
  },
  {
    name: "the fake Aramex in production",
    env: () => productionEnv({ ARAMEX_FAKE: "true" }),
    message: "ARAMEX_FAKE is only allowed outside production",
  },
  {
    name: "a malformed SECRETS_KEY in production",
    env: () => productionEnv({ SECRETS_KEY: "1:not-a-32-byte-key" }),
    message: "SECRETS_KEY must be",
  },
  {
    name: "SECRETS_KEY_PREVIOUS without SECRETS_KEY in production",
    env: () => productionEnv({ SECRETS_KEY: "", SECRETS_KEY_PREVIOUS: `1:${Buffer.alloc(32, 3).toString("base64")}` }),
    message: "SECRETS_KEY_PREVIOUS needs SECRETS_KEY",
  },
  {
    name: "a real Resend key without a redirect outside production",
    env: () => previewEnv({ RESEND_API_KEY: RESEND_KEY }),
    message: "outside production, RESEND_API_KEY needs MAIL_REDIRECT_TO",
  },
]

test.describe.configure({ mode: "serial" })

for (const refused of REFUSED) {
  test(`the api refuses to boot with ${refused.name}`, ONCE, async ({ page, step }) => {
    await step(`the api exits with "${refused.message}"`, async () => {
      const { code, output } = boot(refused.env())
      await show(page, `${refused.name}: exit code ${code}`, output)
      expect(code, output).not.toBe(0)
      expect(output).toContain(refused.message)
    })
  })
}

test("a valid preview environment boots and answers /health", ONCE, async ({ page, request, step }) => {
  let child: ChildProcess | undefined
  try {
    await step("the api starts on a spare port", async () => {
      child = spawn("bun", ["src/index.ts"], { cwd: API_DIR, env: previewEnv(), stdio: "ignore" })
      await expect
        .poll(async () => (await request.get(`http://localhost:${SPARE_PORT}/health`).catch(() => null))?.status(), {
          timeout: 15_000,
        })
        .toBe(200)
      await show(page, "preview env: /health", "200 OK")
    })
  } finally {
    child?.kill("SIGTERM")
  }
})

test(
  "production without SECRETS_KEY still boots, the key is optional by design",
  ONCE,
  async ({ page, request, step }) => {
    let child: ChildProcess | undefined
    const api = `http://localhost:${SPARE_PORT}`
    try {
      await step("the api starts in production mode with no vault key", async () => {
        child = spawn("bun", ["src/index.ts"], {
          cwd: API_DIR,
          env: productionEnv({ SECRETS_KEY: "", ARAMEX_FAKE: "" }),
          stdio: "ignore",
        })
        await expect
          .poll(async () => (await request.get(`${api}/health`).catch(() => null))?.status(), { timeout: 15_000 })
          .toBe(200)
        await show(page, "production without SECRETS_KEY: /health", "200 OK")
      })
    } finally {
      child?.kill("SIGTERM")
    }
  },
)
