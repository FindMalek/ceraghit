import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
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
 *
 * Specs are discovered from `specs/dashboard/*.e2e.ts`: adding a file needs no edit here, so PRs never conflict on it.
 * Order: the files in DASHBOARD_FIRST (they reset what the others rely on), then everything else by file name.
 * Name a spec so it sorts where it must run; a spec that needs an earlier state belongs in DASHBOARD_FIRST.
 */
const DASHBOARD_FIRST = ["auth", "onboarding"]
const DASHBOARD_SUFFIX = ".e2e.ts"
const DASHBOARD_DIR = fileURLToPath(new URL("./specs/dashboard", import.meta.url))
const DASHBOARD_SPECS: string[] = (() => {
  const found = readdirSync(DASHBOARD_DIR)
    .filter((file) => file.endsWith(DASHBOARD_SUFFIX))
    .map((file) => file.slice(0, -DASHBOARD_SUFFIX.length))
    .sort()
  const first = DASHBOARD_FIRST.filter((spec) => found.includes(spec))
  return [...first, ...found.filter((spec) => !first.includes(spec))]
})()
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

/** Tutorial journeys change data, so they run last and alone, desktop then mobile (iPhone 14 on chromium, as the recorder does). */
const LAST_DASHBOARD = prevName(DASHBOARD_PROJECTS.length)
const JOURNEY_PROJECTS = (["desktop", "mobile"] as const).map((device) => ({
  name: `journeys-${device}`,
  testMatch: /journeys\/.*\.e2e\.ts/,
  workers: 1,
  dependencies: ["setup", device === "desktop" ? LAST_DASHBOARD : "journeys-desktop"],
  use: {
    ...(device === "desktop"
      ? { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }
      : { ...devices["iPhone 14"], defaultBrowserType: "chromium" as const }),
    locale: "fr-FR",
    appLocale: "fr" as AppLocale,
  },
}))

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
      testIgnore: /(dashboard|journeys)\//,
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
      testIgnore: /(dashboard|journeys)\//,
      grepInvert: grepInvert(locale, "mobile"),
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], locale: browserLocale, appLocale: locale },
    })),
    ...DASHBOARD_PROJECTS,
    ...JOURNEY_PROJECTS,
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
