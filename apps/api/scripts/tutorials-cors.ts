/**
 * Prints the CORS rules the production bucket needs for the hosted tutorial videos, and the commands to apply and verify
 * them. Reads no credentials and changes nothing.
 *
 *   pnpm tutorials:cors --check              read-only curl probes of the live CDN, PASS/FAIL, exit 1 on a failure
 *   pnpm tutorials:cors                      human readable: rules, apply commands, verify commands
 *   pnpm -s tutorials:cors --format wrangler JSON for `wrangler r2 bucket cors set`
 *   pnpm -s tutorials:cors --format s3       JSON for `aws s3api put-bucket-cors`
 *
 * Options: --bucket (ceraghit-prod), --dashboard-origin, --web-origin, --cdn (S3_PUBLIC_URL, else https://cdn.ceraghit.com)
 */
import { spawnSync } from "node:child_process"
import { buildCorsPlan, runCorsChecks } from "@workspace/orpc/tutorial-cors"

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(name)
  return (i >= 0 ? args[i + 1] : undefined) || fallback
}

try {
  const input = {
    bucket: option("--bucket", "ceraghit-prod"),
    dashboardOrigin: option("--dashboard-origin", "https://dashboard.ceraghit.com"),
    webOrigin: option("--web-origin", "https://ceraghit.com"),
    cdnUrl: option("--cdn", process.env.S3_PUBLIC_URL || "https://cdn.ceraghit.com"),
  }
  if (args.includes("--check")) {
    const curl = (curlArgs: string[]) =>
      spawnSync("curl", ["--max-time", "15", ...curlArgs], { encoding: "utf8" }).stdout
    const checks = runCorsChecks(input, curl)
    for (const c of checks) console.info(`${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`)
    process.exit(checks.every((c) => c.ok) ? 0 : 1)
  }
  const plan = buildCorsPlan(input)
  const format = option("--format", "")
  if (format === "wrangler") console.info(JSON.stringify(plan.wrangler, null, 2))
  else if (format === "s3") console.info(JSON.stringify(plan.s3, null, 2))
  else if (format) throw new Error(`--format must be wrangler or s3, got ${format}`)
  else {
    console.info(
      `# S3 api / R2 json (replaces the whole CORS configuration of the bucket)\n${JSON.stringify(plan.s3, null, 2)}`,
    )
    console.info(`\n# wrangler json\n${JSON.stringify(plan.wrangler, null, 2)}`)
    console.info(
      `\n# apply (one of them). WARNING: setting CORS REPLACES the whole bucket configuration.\n# Run: wrangler r2 bucket cors list ceraghit-prod  FIRST and keep the output. CORS for the dashboard origin was already\n# live on 2026-11-22: only apply to rebuild it. Needs your Cloudflare login or R2 admin credentials\n${plan.apply.join("\n")}`,
    )
    console.info(`\n# verify\n${plan.verify.join("\n")}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "failed")
  process.exit(1)
}
