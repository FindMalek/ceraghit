// CI check `pr-body`: the PR body links an issue, has at least one inline image, and every `pr-assets` image exists.
// Reads the body from the BODY env var. Run by .github/workflows/pr-body.yml after `git fetch origin pr-assets`.
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const CLOSES = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?|refs?)\s+#\d+/i
const MD_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g
const HTML_IMAGE = /<img[^>]+src="([^"]+)"/gi

export function checkBody(body, exists, repo = "FindMalek/ceraghit") {
  const errors = []
  const text = body ?? ""
  if (!CLOSES.test(text)) errors.push("no `Closes #<issue>` or `Refs #<issue>` in the PR body")

  const urls = [...text.matchAll(MD_IMAGE), ...text.matchAll(HTML_IMAGE)].map((m) => m[1])
  if (!urls.length) errors.push("no inline screenshot in the PR body (see docs/pr-process.md, `pnpm pr:screenshots`)")

  const screenshots = text.match(/^##\s+Screenshots\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im)
  if (screenshots && !screenshots[1].replace(/<!--[\s\S]*?-->/g, "").trim())
    errors.push("the Screenshots section only holds the template comment")

  const prefix = `https://github.com/${repo}/blob/pr-assets/`.toLowerCase()
  for (const url of urls) {
    if (!url.toLowerCase().startsWith(prefix)) continue
    const path = url.slice(prefix.length).split(/[?#]/)[0].split("/").map(decodeURIComponent).join("/")
    if (!exists(path)) errors.push(`pr-assets has no file ${path} (typo or not pushed)`)
  }
  return errors
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exists = (path) => {
    try {
      execFileSync("git", ["cat-file", "-e", `FETCH_HEAD:${path}`], { stdio: "ignore" })
      return true
    } catch {
      return false
    }
  }
  const errors = checkBody(process.env.BODY, exists, process.env.GITHUB_REPOSITORY)
  for (const e of errors) console.log(`::error::${e}`)
  if (errors.length) process.exit(1)
  console.log("PR body ok")
}
