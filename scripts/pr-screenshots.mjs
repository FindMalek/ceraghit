// Uploads a folder of screenshots to the orphan `pr-assets` branch and prints paste-ready markdown for the PR body.
// Commits are built with plumbing (temporary index, commit-tree), so no checkout or branch of the caller is touched.
// Usage: pnpm pr:screenshots [dir] [--key <pr-number|branch>] [--dry-run]
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, relative, sep } from "node:path"

const BRANCH = "pr-assets"
const MAX_BYTES = 5 * 1024 * 1024
const MAX_ATTEMPTS = 8
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", ...opts }).trim()
const tryRun = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}
const fail = (msg) => {
  console.error(`pr:screenshots: ${msg}`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = { dir: "test/e2e/artifacts/screenshots", key: "", dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") out.dryRun = true
    else if (a === "--key") out.key = argv[++i] ?? ""
    else if (a.startsWith("--key=")) out.key = a.slice(6)
    else if (a === "--") continue
    else if (a.startsWith("-")) fail(`unknown option ${a}`)
    else out.dir = a
  }
  return out
}

const slug = (segment) =>
  segment
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x"

function collect(dir) {
  let root
  try {
    root = statSync(dir)
  } catch {
    fail(`${dir} does not exist`)
  }
  if (!root.isDirectory()) fail(`${dir} is not a folder`)
  const files = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (IMAGE_EXT.has(extname(name).toLowerCase())) {
        if (st.size > MAX_BYTES) fail(`${p} is ${(st.size / 1024 / 1024).toFixed(1)} MB, the limit is 5 MB`)
        files.push({ src: p, dest: relative(dir, p).split(sep).map(slug).join("/") })
      }
    }
  }
  walk(dir)
  if (!files.length) fail(`no png/jpg/webp/gif images in ${dir}`)
  return files
}

function repoSlug() {
  const url = tryRun("git", ["remote", "get-url", "origin"])
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : "FindMalek/ceraghit"
}

function defaultKey(repo) {
  const branch = tryRun("git", ["branch", "--show-current"])
  if (!branch) fail("cannot guess the key (detached HEAD), pass --key")
  // REST, not `gh pr view`: GraphQL quota is shared by every agent on the account
  const owner = repo.split("/")[0]
  const pr = tryRun("gh", [
    "api",
    `repos/${repo}/pulls?head=${owner}:${branch}&state=all`,
    "--jq",
    ".[0].number // empty",
  ])
  return /^\d+$/.test(pr) ? pr : branch.replaceAll("/", "-")
}

function markdown(files, repo, key) {
  const groups = new Map()
  for (const f of files) {
    const parts = f.dest.split("/")
    const group = parts.length > 1 ? parts[0] : ""
    const alt = parts
      .at(-1)
      .replace(/\.[^.]+$/, "")
      .replaceAll(/[-_]+/g, " ")
    const path = [key, ...parts].map(encodeURIComponent).join("/")
    const line = `![${alt}](https://github.com/${repo}/blob/${BRANCH}/${path}?raw=true)`
    groups.set(group, [...(groups.get(group) ?? []), line])
  }
  return [...groups]
    .map(([group, lines]) => (group ? `**${group}**\n\n${lines.join("\n")}` : lines.join("\n")))
    .join("\n\n")
}

function remoteHead() {
  const line = git(["ls-remote", "origin", `refs/heads/${BRANCH}`])
  return line ? line.split(/\s+/)[0] : ""
}

function commitOnto(parent, files, key, indexFile) {
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  rmSync(indexFile, { force: true })
  if (parent) {
    git(["fetch", "--quiet", "--no-tags", "origin", parent])
    git(["read-tree", parent], { env })
  } else git(["read-tree", "--empty"], { env })
  for (const f of files) {
    const blob = git(["hash-object", "-w", "--", f.src])
    git(["update-index", "--add", "--cacheinfo", `100644,${blob},${key}/${f.dest}`], { env })
  }
  const tree = git(["write-tree"], { env })
  if (parent && git(["rev-parse", `${parent}^{tree}`]) === tree) return parent
  const parentArgs = parent ? ["-p", parent] : []
  return git(["commit-tree", tree, ...parentArgs, "-m", `chore(pr-assets): add ${key} screenshots`])
}

function upload(files, key) {
  const tmp = mkdtempSync(join(tmpdir(), "pr-assets-"))
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const parent = remoteHead()
      const commit = commitOnto(parent, files, key, join(tmp, "index"))
      if (commit === parent) return
      try {
        execFileSync("git", ["push", "--quiet", "origin", `${commit}:refs/heads/${BRANCH}`], {
          stdio: ["ignore", "ignore", "pipe"],
        })
        return
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) fail(`push failed after ${MAX_ATTEMPTS} attempts\n${err.stderr ?? err.message}`)
        console.error(`pr:screenshots: ${BRANCH} moved during the push, retrying (${attempt}/${MAX_ATTEMPTS})`)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000 + Math.random() * 2000)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const args = parseArgs(process.argv.slice(2))
const files = collect(args.dir)
const repo = repoSlug()
const key = slug(args.key || defaultKey(repo))
if (!args.dryRun) upload(files, key)
console.log(markdown(files, repo, key))
