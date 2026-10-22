// Keeps the agent rules in sync: every .cursor/rule is imported by CLAUDE.md and described, every pnpm command AGENTS.md
// names exists, every app has its AGENTS.md. Run by CI (`pnpm rules:check`).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const errors = []
const read = (p) => readFileSync(p, "utf8")

const rules = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith(".mdc")) rules.push(p)
  }
}
walk(".cursor/rules")

const claude = read("CLAUDE.md")
for (const rule of rules) {
  if (!claude.includes(`@${rule}`)) errors.push(`CLAUDE.md does not import ${rule}`)
  if (!/^---\n[\s\S]*?description: .+[\s\S]*?\n---/.test(read(rule)))
    errors.push(`${rule} has no frontmatter description`)
}
for (const m of claude.matchAll(/^@(\S+)$/gm)) {
  if (m[1] !== "AGENTS.md" && !existsSync(m[1])) errors.push(`CLAUDE.md imports a missing file: ${m[1]}`)
}

const scripts = JSON.parse(read("package.json")).scripts
for (const m of read("AGENTS.md").matchAll(/`pnpm (?:run )?([a-z][\w:-]*)/g)) {
  if (!(m[1] in scripts) && !["ui", "dev"].includes(m[1]))
    errors.push(`AGENTS.md mentions "pnpm ${m[1]}" which is not a root script`)
}
for (const app of readdirSync("apps")) {
  if (!existsSync(join("apps", app, "AGENTS.md"))) errors.push(`apps/${app}/AGENTS.md is missing`)
}

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join("\n"))
  process.exit(1)
}
console.info(`rules in sync (${rules.length} rule files)`)
