// Production migrates Neon before the new code ships and a code rollback keeps the new schema, so every migration must
// work with the previous release. Blocks destructive statements in new migrations, edits to merged ones and (with --pr)
// a second open PR adding a migration. Run by .github/workflows/migrations.yml and deploy.yml, see docs/deploy.md.
//
//   node scripts/check-migrations.mjs --base <ref> [--head <ref>] [--pr <number>]
//
// Without --head the working tree is checked, so a freshly generated migration can be tried before committing.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const DIR = "packages/db/drizzle/"
const BREAKPOINT = "--> statement-breakpoint"
const MARKER = /^\s*--\s*destructive-ok:\s*\S/i

const RULES = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|VIEW|MATERIALIZED\s+VIEW)\b/i, (m) => `drops a ${m[1].toLowerCase()}`],
  [/\bTRUNCATE\b/i, () => "truncates a table"],
  [/\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i, () => "deletes every row (DELETE without WHERE)"],
  [/\bRENAME\b/i, () => "renames something the running release still uses"],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, () => "changes a column type"],
  [/\bSET\s+NOT\s+NULL\b/i, () => "makes an existing column NOT NULL"],
  [/\bADD\s+COLUMN\b(?=[\s\S]*\bNOT\s+NULL\b)(?![\s\S]*\bDEFAULT\b)/i, () => "adds a NOT NULL column without DEFAULT"],
  [/\bDROP\s+DEFAULT\b/i, () => "drops a column default"],
]

const HOW =
  "not backward compatible with the release still running: expand then contract over two releases (docs/deploy.md). " +
  "If the owner really wants it: a `-- destructive-ok: <reason>` line above the statement (the only allowed hand edit " +
  "to a generated migration) plus the owner-only `migration:destructive` label."

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, "")

export function checkSql(sql, file, { allowDestructive = process.env.ALLOW_DESTRUCTIVE === "true" } = {}) {
  const problems = []
  const lines = sql.split("\n")
  let chunk = []

  const flush = () => {
    const sqlLines = chunk.filter((l) => stripComments(l.text).trim())
    if (!sqlLines.length) return
    const marked = chunk.slice(0, chunk.indexOf(sqlLines[0])).some((l) => MARKER.test(l.text))
    const statement = stripComments(sqlLines.map((l) => l.text).join("\n"))
      .replace(/\s+/g, " ")
      .trim()
    for (const [re, why] of RULES) {
      const m = statement.match(re)
      if (!m) continue
      if (marked && allowDestructive) continue
      const at = sqlLines.find((l) => re.test(stripComments(l.text))) ?? sqlLines[0]
      const reason = marked
        ? `${why(m)}: marked destructive-ok but the PR has no \`migration:destructive\` label (owner only)`
        : `${why(m)}: ${HOW}`
      problems.push({ file, line: at.line, statement, reason })
    }
  }

  for (const [i, text] of lines.entries()) {
    const idx = text.indexOf(BREAKPOINT)
    if (idx === -1) {
      chunk.push({ text, line: i + 1 })
      continue
    }
    chunk.push({ text: text.slice(0, idx), line: i + 1 })
    flush()
    chunk = [{ text: text.slice(idx + BREAKPOINT.length), line: i + 1 }]
  }
  flush()
  return problems
}

// prs: [{ number, files: string[] }] of every open PR. Returns the lower-numbered ones that also add a migration, so the
// oldest migration PR always passes and the newer ones wait for it.
export function olderMigrationPrs(prs, number) {
  const isMigration = (f) => f.startsWith(DIR) && f.endsWith(".sql")
  return prs
    .filter((pr) => pr.number < number && pr.files.some(isMigration))
    .map((pr) => pr.number)
    .sort((a, b) => a - b)
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" })
const ghJson = (path) =>
  JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", path], { encoding: "utf8" })).flat()

function changedMigrations(base, head) {
  const range = head ? [`${base}...${head}`] : [git("merge-base", base, "HEAD").trim()]
  const changes = git("diff", "--name-status", "-M", ...range, "--", DIR)
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [status, ...paths] = row.split("\t")
      return { status: status[0], path: paths.at(-1), from: paths[0] }
    })
  if (!head) {
    for (const path of git("ls-files", "--others", "--exclude-standard", "--", DIR).split("\n").filter(Boolean))
      changes.push({ status: "A", path, from: path })
  }
  return changes.filter((c) => c.from.endsWith(".sql") || c.path.endsWith(".sql"))
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv[i + 1]
  }
  const base = arg("--base")
  const head = arg("--head")
  const pr = arg("--pr")
  if (!base) {
    console.error("usage: node scripts/check-migrations.mjs --base <ref> [--head <ref>] [--pr <number>]")
    process.exit(2)
  }

  const problems = []
  const changes = changedMigrations(base, head)
  for (const c of changes) {
    if (c.status !== "A") {
      problems.push({
        file: c.from,
        line: 1,
        reason: "never edit a merged migration: change schema.ts and run pnpm db:generate",
      })
      continue
    }
    const sql = head ? git("show", `${head}:${c.path}`) : existsSync(c.path) ? readFileSync(c.path, "utf8") : ""
    problems.push(...checkSql(sql, c.path))
  }

  const added = changes.filter((c) => c.status === "A")
  if (pr && added.length) {
    const repo = process.env.GITHUB_REPOSITORY ?? "FindMalek/ceraghit"
    const open = ghJson(`repos/${repo}/pulls?state=open&per_page=100`)
      .filter((p) => p.number < Number(pr))
      .map((p) => ({
        number: p.number,
        files: ghJson(`repos/${repo}/pulls/${p.number}/files?per_page=100`).map((f) => f.filename),
      }))
    for (const n of olderMigrationPrs(open, Number(pr)))
      problems.push({
        file: added[0].path,
        line: 1,
        reason: `#${n} has a migration open: wait for it to merge, rebase on main, run pnpm db:generate again and push`,
      })
  }

  for (const p of problems) console.log(`::error file=${p.file},line=${p.line}::${p.reason}`)
  if (problems.length) {
    console.error(`${problems.length} migration problem(s)`)
    process.exit(1)
  }
  console.log(`migrations ok (${added.length} new, ${base}...${head ?? "working tree"})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2))
