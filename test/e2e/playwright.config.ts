import { defineConfig, devices } from "@playwright/test"
import { apiEnv, E2E, nextEnv } from "./env"
import type { AppLocale, E2EOptions } from "./fixtures"

const LOCALES: { locale: AppLocale; browserLocale: string }[] = [
  { locale: "fr", browserLocale: "fr-FR" },
  { locale: "en", browserLocale: "en-US" },
  { locale: "ar", browserLocale: "ar-TN" },
]

/** Tests tagged @fr only run in the fr projects, @desktop only in the desktop ones: no skips, nothing is quarantined. */
function grepInvert(locale: AppLocale, device: "desktop" | "mobile"): RegExp | undefined {
  const tags = [locale === "fr" ? "" : "@fr", device === "desktop" ? "" : "@desktop"].filter(Boolean)
  return tags.length > 0 ? new RegExp(tags.join("|")) : undefined
}

/**
 * Dashboard specs reset the shop profile, the lockout counters and sessions, which every other spec relies on,
 * so each file runs alone, after the storefront projects, desktop before mobile.
 */
const DASHBOARD_SPECS = [
  "auth",
  "onboarding",
  "product-gallery",
  "list-filters",
  "orders",
  "order-mails",
  "products-crud",
] as const
const DASHBOARD_PROJECTS = (["desktop", "mobile"] as const).flatMap((device, d) =>
  DASHBOARD_SPECS.map((spec, s) => {
    const index = d * DASHBOARD_SPECS.length + s
    const previous =
      index === 0 ? LOCALES.flatMap(({ locale }) => [`desktop-${locale}`, `mobile-${locale}`]) : [prevName(index)]
    return {
      name: `dashboard-${spec}-${device}`,
      testMatch: new RegExp(`dashboard/${spec}\\.e2e\\.ts`),
      dependencies: ["setup", ...previous],
      use: {
        ...(device === "desktop"
          ? { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
          : devices["Pixel 7"]),
        locale: "fr-FR",
        appLocale: "fr" as AppLocale,
      },
    }
  }),
)

function prevName(index: number): string {
  const device = Math.floor((index - 1) / DASHBOARD_SPECS.length) === 0 ? "desktop" : "mobile"
  return `dashboard-${DASHBOARD_SPECS[(index - 1) % DASHBOARD_SPECS.length]}-${device}`
}

const reuse = process.env.E2E_REUSE === "1"
const server = { reuseExistingServer: reuse, timeout: 120_000, cwd: E2E.repoRoot } as const

export default defineConfig<E2EOptions>({
  testDir: "./specs",
  outputDir: "./artifacts/test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/report", open: "never" }],
    ["json", { outputFile: "artifacts/results.json" }],
  ],
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    ...LOCALES.map(({ locale, browserLocale }) => ({
      name: `desktop-${locale}`,
      testMatch: /.*\.e2e\.ts/,
      testIgnore: /dashboard\//,
      grepInvert: grepInvert(locale, "desktop"),
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        locale: browserLocale,
        appLocale: locale,
      },
    })),
    ...LOCALES.map(({ locale, browserLocale }) => ({
      name: `mobile-${locale}`,
      testMatch: /.*\.e2e\.ts/,
      testIgnore: /dashboard\//,
      grepInvert: grepInvert(locale, "mobile"),
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], locale: browserLocale, appLocale: locale },
    })),
    ...DASHBOARD_PROJECTS,
  ],
  webServer: [
    {
      ...server,
      command: "bun src/index.ts",
      cwd: `${E2E.repoRoot}apps/api`,
      url: `${E2E.apiUrl}/health`,
      env: apiEnv(),
    },
    {
      ...server,
      command: `pnpm --filter web exec next start --port ${E2E.ports.web}`,
      url: E2E.webUrl,
      env: nextEnv(),
    },
    {
      ...server,
      command: `pnpm --filter dashboard exec next start --port ${E2E.ports.dashboard}`,
      url: `${E2E.dashboardUrl}/login`,
      env: nextEnv(),
    },
  ],
})
