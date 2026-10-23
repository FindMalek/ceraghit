#!/usr/bin/env node
// Per-PR previews and the permanent staging on the-keep through the Dokploy API, see docs/deploy.md. Production is Vercel, not here.
import { randomBytes } from "node:crypto"

const MODE = process.argv[2]
const COMMENT_MARKER = "<!-- ceraghit-preview -->"
const PREVIEW_PROJECT = "ceraghit-previews"
const STAGING_PROJECT = "ceraghit-staging"
const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 15 * 60_000
const COMMENT_TITLE =
  "**Preview deployments** on the-keep (Dokploy). Learn more in [docs/deploy.md](../blob/main/docs/deploy.md)."
const IMAGE = (app, tag) => `ghcr.io/findmalek/ceraghit-${app}:${tag}`

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const DOKPLOY_URL = requireEnv("DOKPLOY_URL").replace(/\/$/, "")
const DOKPLOY_API_KEY = requireEnv("DOKPLOY_API_KEY")

async function dokploy(path, body) {
  const isQuery = body === undefined
  const res = await fetch(`${DOKPLOY_URL}/api/${path}`, {
    method: isQuery ? "GET" : "POST",
    headers: { "x-api-key": DOKPLOY_API_KEY, "content-type": "application/json" },
    body: isQuery ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`dokploy ${path} ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const query = (path, params) => dokploy(`${path}?${new URLSearchParams(params)}`)

async function findProject(name) {
  const projects = await dokploy("project.all")
  return projects.find((p) => p.name === name) ?? null
}

async function ensureEnvironment(projectName) {
  let project = await findProject(projectName)
  if (!project) {
    await dokploy("project.create", {
      name: projectName,
      description: "managed by ceraghit scripts/deploy/dokploy.mjs",
    })
    project = await findProject(projectName)
  }
  const environment = project?.environments?.[0]
  if (!environment) throw new Error(`no environment in project ${projectName}`)
  return { ...environment, projectId: project.projectId, projectName }
}

function parseEnvBlock(text) {
  return Object.fromEntries(
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  )
}

const envText = (vars) =>
  Object.entries(vars)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

// project.all can hide postgres services from an api key, so the id is also kept in the api app's env.
async function storedPostgresId(environment, apiAppName) {
  const app = environment.applications?.find((a) => a.name === apiAppName)
  if (!app) return null
  const { env } = await query("application.one", { applicationId: app.applicationId })
  return parseEnvBlock(env).CERAGHIT_DB_POSTGRES_ID ?? null
}

async function ensurePostgres(environment, name, apiAppName) {
  const knownId =
    (await storedPostgresId(environment, apiAppName)) ?? environment.postgres?.find((p) => p.name === name)?.postgresId
  if (knownId) return query("postgres.one", { postgresId: knownId })
  const created = await dokploy("postgres.create", {
    name,
    appName: name,
    databaseName: "ceraghit",
    databaseUser: "ceraghit",
    databasePassword: randomBytes(18).toString("hex"),
    dockerImage: "postgres:17-alpine",
    environmentId: environment.environmentId,
  })
  const postgresId =
    created?.postgresId ??
    (await ensureEnvironment(environment.projectName)).postgres.find((p) => p.name === name)?.postgresId
  await dokploy("postgres.deploy", { postgresId })
  return query("postgres.one", { postgresId })
}

const postgresUrl = (pg) =>
  `postgresql://${pg.databaseUser}:${pg.databasePassword}@${pg.appName}:5432/${pg.databaseName}`

async function ensureApplication(environment, name) {
  const existing = environment.applications?.find((a) => a.name === name)
  if (existing) return existing
  await dokploy("application.create", { name, appName: name, environmentId: environment.environmentId })
  const fresh = await ensureEnvironment(environment.projectName)
  const app = fresh.applications.find((a) => a.name === name)
  if (!app) throw new Error(`application ${name} was not created`)
  return app
}

async function ensureDomain(applicationId, host, port) {
  const domains = await query("domain.byApplicationId", { applicationId })
  if (domains.some((d) => d.host === host)) return
  await dokploy("domain.create", {
    host,
    port,
    https: true,
    certificateType: "letsencrypt",
    applicationId,
    domainType: "application",
  })
}

async function deployApp(environment, app) {
  const { applicationId } = await ensureApplication(environment, app.name)
  await dokploy("application.saveDockerProvider", {
    applicationId,
    dockerImage: app.image,
    registryUrl: "ghcr.io",
    username: requireEnv("GHCR_USERNAME"),
    password: requireEnv("GHCR_READ_TOKEN"),
  })
  await dokploy("application.saveEnvironment", {
    applicationId,
    env: envText(app.env),
    buildArgs: null,
    buildSecrets: null,
    createEnvFile: false,
  })
  await ensureDomain(applicationId, app.host, app.port)
  await dokploy("application.deploy", { applicationId })
  const { appName } = await query("application.one", { applicationId })
  return { ...app, applicationId, appName, projectId: environment.projectId, status: "building" }
}

async function waitForApps(deployed, onChange) {
  const started = Date.now()
  const pending = new Map(deployed.map((d) => [d.applicationId, d]))
  while (pending.size > 0) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    for (const [id, app] of pending) {
      const { applicationStatus } = await query("application.one", { applicationId: id })
      if (applicationStatus === "done" || applicationStatus === "error") {
        app.status = applicationStatus === "done" ? "ready" : "failed"
        pending.delete(id)
        await onChange()
      }
    }
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      for (const app of pending.values()) app.status = "failed"
      await onChange()
      break
    }
  }
  return deployed.every((d) => d.status === "ready")
}

/** The api goes first: web and dashboard reach it by its swarm service name on dokploy-network. */
async function deployAll(environment, { tag, hosts, apiEnv }) {
  const suffix = tag.startsWith("pr-") ? `-${tag}` : ""
  const urls = Object.fromEntries(Object.entries(hosts).map(([k, h]) => [k, `https://${h}`]))
  const api = await deployApp(environment, {
    name: `ceraghit-api${suffix}`,
    label: "api",
    image: IMAGE("api", tag),
    host: hosts.api,
    port: 3001,
    env: { NODE_ENV: "production", WEB_URL: urls.web, API_PUBLIC_URL: urls.api, ...apiEnv },
  })
  const front = { API_URL: `http://${api.appName}:3001`, WEB_URL: urls.web, APP_ENV: "preview" }
  const web = await deployApp(environment, {
    name: `ceraghit-web${suffix}`,
    label: "web",
    image: IMAGE("web", tag),
    host: hosts.web,
    port: 3000,
    env: front,
  })
  const dashboard = await deployApp(environment, {
    name: `ceraghit-dashboard${suffix}`,
    label: "dashboard",
    image: IMAGE("dashboard", tag),
    host: hosts.dashboard,
    port: 3002,
    env: front,
  })
  return [web, dashboard, api]
}

/** Previews never get live keys: the gateway is the demo checkout unless Konnect sandbox keys are provided. */
function previewApiEnv() {
  return {
    APP_ENV: "preview",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    KONNECT_API_KEY: process.env.KONNECT_TEST_API_KEY,
    KONNECT_WALLET_ID: process.env.KONNECT_TEST_WALLET_ID,
    KONNECT_MODE: "test",
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION || "garage",
    S3_BUCKET: process.env.PREVIEW_S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.PREVIEW_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.PREVIEW_S3_SECRET_ACCESS_KEY,
    BOOTSTRAP: "true",
    SEED_DEMO: "true",
  }
}

const STATUS = { building: "🔄 Building", ready: "✅ Ready", failed: "❌ Failed", deleted: "🗑 Deleted" }

function renderAccess(access) {
  if (!access) return []
  return [
    "",
    `**Preview access** · \`${access.tag}\``,
    "",
    "| | |",
    "| :-- | :-- |",
    `| Dashboard login | https://${access.dashboardHost} · \`${access.email}\` / \`${access.password}\` |`,
    `| Payments | ${access.payments} |`,
    `| Database (LAN / tailnet) | \`${access.databaseUrl}\` |`,
    `| psql on the server | \`pnpm db:shell ${access.tag}\` |`,
    `| Drizzle Studio | \`DATABASE_URL='${access.databaseUrl}' pnpm db:studio\` |`,
    `| Uploads | \`${access.bucket}/${access.tag}/\` on ${access.s3} |`,
    `| API docs | https://${access.apiHost}/v1/docs |`,
    "",
    "<sub>Seeded with the real catalogue and two months of demo orders in TND and EUR. Everything here is deleted when the PR closes.</sub>",
  ]
}

function renderComment(rows, access) {
  const updated = new Date().toLocaleString("en-GB", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const lines = rows.map((row) => {
    const inspect = row.applicationId
      ? ` ([Inspect](${DOKPLOY_URL}/dashboard/project/${row.projectId}/services/application/${row.applicationId}))`
      : ""
    const preview = row.status === "ready" && row.host ? `[Visit preview](https://${row.host})` : ""
    return `| **${row.label}** | ${STATUS[row.status]}${inspect} | ${preview} | ${updated} |`
  })
  return [
    COMMENT_MARKER,
    COMMENT_TITLE,
    "",
    "| App | Status | Preview | Updated (Tunis) |",
    "| :--- | :----- | :------ | :------ |",
    ...lines,
    ...renderAccess(access),
  ].join("\n")
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`github ${path} ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function upsertComment(body) {
  const repo = requireEnv("GITHUB_REPOSITORY")
  const pr = requireEnv("PR_NUMBER")
  const comments = await github(`/repos/${repo}/issues/${pr}/comments?per_page=100`)
  const existing = comments.find((c) => c.body?.startsWith(COMMENT_MARKER))
  if (existing) {
    await github(`/repos/${repo}/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
  } else {
    await github(`/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: JSON.stringify({ body }) })
  }
}

/** A GitHub deployment per PR, so the PR shows a "View deployment" button like Vercel's does. */
async function markDeployment(pr, state, url) {
  const repo = requireEnv("GITHUB_REPOSITORY")
  const environment = `preview-pr-${pr}`
  if (state === "success" || state === "failure") {
    const deployment = await github(`/repos/${repo}/deployments`, {
      method: "POST",
      body: JSON.stringify({
        ref: process.env.HEAD_SHA || requireEnv("GITHUB_SHA"),
        environment,
        auto_merge: false,
        required_contexts: [],
        transient_environment: true,
        description: "Preview on the-keep",
      }),
    })
    await github(`/repos/${repo}/deployments/${deployment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ state, environment_url: url, auto_inactive: true }),
    })
    return
  }
  const deployments = await github(`/repos/${repo}/deployments?environment=${environment}&per_page=100`)
  for (const d of deployments) {
    await github(`/repos/${repo}/deployments/${d.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ state: "inactive" }),
    })
  }
}

const previewHosts = (pr, domain) => ({
  web: `pr-${pr}.${domain}`,
  dashboard: `pr-${pr}-dashboard.${domain}`,
  api: `pr-${pr}-api.${domain}`,
})

/** Previews publish their database on 15000 + PR number: LAN and tailnet only, the router forwards nothing there. */
const previewDbPort = (pr) => 15000 + (Number(pr) % 1000)

/** One admin per preview, generated on the first deploy and kept in the api app's env for the PR's lifetime. */
async function previewAdmin(environment, apiAppName, pr) {
  const app = environment.applications?.find((a) => a.name === apiAppName)
  const current = app ? parseEnvBlock((await query("application.one", { applicationId: app.applicationId })).env) : {}
  return {
    email: current.ADMIN_EMAIL || `admin.pr${pr}@ceraghit.test`,
    password: current.ADMIN_PASSWORD || randomBytes(12).toString("base64url"),
  }
}

async function previewUp() {
  const pr = requireEnv("PR_NUMBER")
  const tag = `pr-${pr}`
  const hosts = previewHosts(pr, requireEnv("PREVIEW_DOMAIN"))
  const environment = await ensureEnvironment(PREVIEW_PROJECT)
  await upsertComment(
    renderComment(["web", "dashboard", "api"].map((label) => ({ label, host: hosts[label], status: "building" }))),
  )
  const pg = await ensurePostgres(environment, `ceraghit-db-${tag}`, `ceraghit-api-${tag}`)
  const port = previewDbPort(pr)
  if (pg.externalPort !== port)
    await dokploy("postgres.saveExternalPort", { postgresId: pg.postgresId, externalPort: port })
  const admin = await previewAdmin(environment, `ceraghit-api-${tag}`, pr)
  const access = {
    tag,
    ...admin,
    databaseUrl: `postgresql://${pg.databaseUser}:${pg.databasePassword}@${requireEnv("PREVIEW_DB_HOST")}:${port}/${pg.databaseName}`,
    bucket: process.env.PREVIEW_S3_BUCKET || "(no bucket)",
    s3: process.env.S3_ENDPOINT || "",
    apiHost: hosts.api,
    dashboardHost: hosts.dashboard,
    payments: process.env.KONNECT_TEST_API_KEY ? "Konnect sandbox" : "demo gateway (pick paid or failed)",
  }
  const deployed = await deployAll(environment, {
    tag,
    hosts,
    apiEnv: {
      ...previewApiEnv(),
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password,
      DATABASE_URL: postgresUrl(pg),
      CERAGHIT_DB_POSTGRES_ID: pg.postgresId,
      DEPLOY_ENV: tag,
    },
  })
  await upsertComment(renderComment(deployed))
  const ok = await waitForApps(deployed, () =>
    upsertComment(renderComment(deployed, deployed.every((d) => d.status === "ready") ? access : undefined)),
  )
  await markDeployment(pr, ok ? "success" : "failure", `https://${hosts.web}`).catch((e) =>
    console.warn("deployment status", e.message),
  )
  if (!ok) process.exitCode = 1
}

async function previewDown() {
  const tag = `pr-${requireEnv("PR_NUMBER")}`
  const project = await findProject(PREVIEW_PROJECT)
  const environment = project?.environments?.[0]
  if (!environment) return
  const postgresId = await storedPostgresId(environment, `ceraghit-api-${tag}`)
  const rows = []
  for (const app of environment.applications ?? []) {
    if (!app.name.endsWith(`-${tag}`)) continue
    await dokploy("application.delete", { applicationId: app.applicationId })
    rows.push({ label: app.name.replace(/^ceraghit-/, "").replace(`-${tag}`, ""), status: "deleted" })
  }
  if (postgresId) await dokploy("postgres.remove", { postgresId })
  if (rows.length) await upsertComment(renderComment(rows))
  await markDeployment(requireEnv("PR_NUMBER"), "inactive").catch((e) => console.warn("deployment status", e.message))
}

async function commentFailed() {
  await upsertComment(renderComment(["web", "dashboard", "api"].map((label) => ({ label, status: "failed" }))))
}

/** Permanent staging: `main` on fixed hosts with its own database. Same guards as a preview, never live payments. */
async function staging() {
  const tag = requireEnv("IMAGE_TAG")
  const hosts = {
    web: requireEnv("STAGING_WEB_HOST"),
    dashboard: requireEnv("STAGING_DASHBOARD_HOST"),
    api: requireEnv("STAGING_API_HOST"),
  }
  const environment = await ensureEnvironment(STAGING_PROJECT)
  const pg = await ensurePostgres(environment, "ceraghit-db", "ceraghit-api")
  const deployed = await deployAll(environment, {
    tag,
    hosts,
    apiEnv: {
      ...previewApiEnv(),
      DATABASE_URL: postgresUrl(pg),
      CERAGHIT_DB_POSTGRES_ID: pg.postgresId,
      DEPLOY_ENV: "staging",
    },
  })
  const ok = await waitForApps(deployed, async () => {})
  for (const d of deployed) console.info(`${d.label}: ${d.status} https://${d.host}`)
  if (!ok) process.exitCode = 1
}

const MODES = { "preview-up": previewUp, "preview-down": previewDown, "comment-failed": commentFailed, staging }
const run = MODES[MODE]
if (!run) {
  console.error(`unknown mode "${MODE}", expected ${Object.keys(MODES).join(" | ")}`)
  process.exit(1)
}
await run()
