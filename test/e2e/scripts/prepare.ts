// Resets the e2e stack: throwaway postgres, S3 and Mailpit, migrated and seeded with the demo data.
// Runs before Playwright (not as globalSetup) so the database exists when `webServer` boots the api.
// E2E_SKIP_PREPARE=1 reuses a stack that is already up. E2E_REUSE=1 lets Playwright reuse running apps.
import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { createConnection } from "node:net"
import { AwsClient } from "aws4fetch"
import { apiEnv, E2E } from "../env"

if (process.env.E2E_SKIP_PREPARE === "1") {
  console.info("e2e prepare skipped")
  process.exit(0)
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {},
): string {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? E2E.repoRoot,
    env: { ...process.env, ...opts.env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed\n${res.stdout}\n${res.stderr}`)
  }
  if (!opts.quiet) process.stdout.write(res.stdout)
  return res.stdout
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

const compose = (...args: string[]) =>
  run("docker", ["compose", "-f", E2E.composeFile, "-p", E2E.composeProject, ...args], { quiet: true })

const garage = (...args: string[]) => compose("exec", "-T", "garage", "/garage", ...args)

async function ensureAppPortsFree(): Promise<void> {
  if (process.env.E2E_REUSE === "1") return
  const taken: number[] = []
  for (const port of [E2E.ports.web, E2E.ports.dashboard, E2E.ports.api]) {
    if (await portInUse(port)) taken.push(port)
  }
  if (taken.length > 0) {
    throw new Error(
      `ports ${taken.join(", ")} are in use (a dev stack?). Stop it, set E2E_*_PORT, or set E2E_REUSE=1 to test the running apps.`,
    )
  }
}

async function waitFor(what: string, check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await check().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${what} did not become ready`)
}

async function setupStorage(): Promise<void> {
  const { bucket, accessKeyId, secretAccessKey, region, endpoint } = E2E.s3
  await waitFor("garage", async () => garage("node", "id", "-q").includes("@"))
  const nodeId = garage("node", "id", "-q").trim().split("@")[0] ?? ""
  garage("layout", "assign", "-z", "dc1", "-c", "1G", nodeId)
  garage("layout", "apply", "--version", "1")
  garage("bucket", "create", bucket)
  garage("key", "import", "--yes", "-n", "e2e", accessKeyId, secretAccessKey)
  garage("bucket", "allow", "--read", "--write", "--owner", bucket, "--key", "e2e")

  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" })
  const origins = [E2E.webUrl, E2E.dashboardUrl].map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join("")
  const cors = `<CORSConfiguration><CORSRule>${origins}<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader></CORSRule></CORSConfiguration>`
  await waitFor(
    "bucket cors",
    async () => (await aws.fetch(`${endpoint}/${bucket}?cors`, { method: "PUT", body: cors })).ok,
  )
}

await ensureAppPortsFree()
rmSync(`${E2E.artifacts}screenshots`, { recursive: true, force: true })
rmSync(`${E2E.artifacts}.auth`, { recursive: true, force: true })

console.info(`e2e prepare: resetting ${E2E.composeProject}`)
compose("down", "-v")
compose("up", "-d", "--wait")

const dbEnv = {
  DATABASE_URL: E2E.databaseUrl,
  ADMIN_EMAIL: apiEnv().ADMIN_EMAIL ?? "",
  ADMIN_PASSWORD: apiEnv().ADMIN_PASSWORD ?? "",
}
// cwd is the db package so Bun does not load the dev `.env` of the repo root.
run("bun", ["src/migrate-cli.ts"], { cwd: `${E2E.repoRoot}packages/db`, env: dbEnv })
run("bun", ["src/seed-cli.ts"], { cwd: `${E2E.repoRoot}packages/db`, env: dbEnv })
await setupStorage()
console.info("e2e prepare: ready")
