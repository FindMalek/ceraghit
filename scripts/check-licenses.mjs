// Fails when a production dependency ships under a copyleft or unknown license.
// Exceptions live in scripts/license-allowlist.json, each with a reason.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const BLOCKED = /(^|[^A-Z])(A?GPL|LGPL|SSPL|BUSL|UNKNOWN|UNLICENSED)/i

function alternativeAllowed(expression) {
  return expression.split(/\s+AND\s+/i).every((term) => !BLOCKED.test(term))
}

export function licenseAllowed(license) {
  const cleaned = license.replace(/[()]/g, "")
  return cleaned.split(/\s+OR\s+/i).some(alternativeAllowed)
}

function matchesName(pattern, name) {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name
}

function isAllowlisted(allowlist, name, license) {
  return allowlist.packages.some((entry) => entry.license === license && matchesName(entry.name, name))
}

export function findViolations(groups, allowlist) {
  const violations = []
  for (const [license, packages] of Object.entries(groups)) {
    if (licenseAllowed(license)) continue
    for (const pkg of packages) {
      if (pkg.name.startsWith("@workspace/")) continue
      if (isAllowlisted(allowlist, pkg.name, license)) continue
      violations.push({ name: pkg.name, versions: pkg.versions, license })
    }
  }
  return violations
}

export function staleAllowlistEntries(groups, allowlist) {
  const present = Object.entries(groups).flatMap(([license, packages]) =>
    packages.map((pkg) => ({ license, name: pkg.name })),
  )
  return allowlist.packages.filter(
    (entry) => !present.some((pkg) => pkg.license === entry.license && matchesName(entry.name, pkg.name)),
  )
}

function main() {
  const allowlist = JSON.parse(readFileSync(new URL("./license-allowlist.json", import.meta.url), "utf8"))
  const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  const groups = JSON.parse(raw)
  const violations = findViolations(groups, allowlist)
  const total = Object.values(groups).reduce((sum, packages) => sum + packages.length, 0)

  for (const entry of staleAllowlistEntries(groups, allowlist)) {
    console.warn(`allowlist entry not used on this platform: ${entry.name} (${entry.license})`)
  }
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(
        `::error::${v.name}@${v.versions.join(",")} is ${v.license}, add it to scripts/license-allowlist.json with a reason or drop it`,
      )
    }
    process.exit(1)
  }
  console.log(`licenses ok: ${total} production packages checked`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
