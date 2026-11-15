import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

const ROOT = join(import.meta.dir, "..")
const FOLDERS = ["app", "components"]
const VISIBLE_ATTRIBUTES = new Set(["aria-label", "placeholder", "title", "alt"])
const BRAND_WORDS = new Set(["Ceraghit", "Ceraghit Creation"])

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith(".tsx") ? [path] : []
  })
}

function literalText(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const report = (node: ts.Node, text: string) => {
    const value = text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").replace(/\s+/g, " ")
    if (!/\p{L}/u.test(value) || BRAND_WORDS.has(value)) return
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    found.push(`${relative(ROOT, file)}:${line + 1} ${value}`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    if (
      ts.isJsxAttribute(node) &&
      VISIBLE_ATTRIBUTES.has(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      report(node, node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

test("web components show no hardcoded text, only messages", () => {
  const found = FOLDERS.flatMap((folder) => tsxFiles(join(ROOT, folder))).flatMap(literalText)
  expect(found).toEqual([])
})
