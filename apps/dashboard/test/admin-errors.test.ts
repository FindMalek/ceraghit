import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { ORPCError } from "@orpc/client"
import ts from "typescript"
import { errorMessage } from "../lib/errors"

const SRC = join(import.meta.dir, "../../../packages/orpc/src")
const SHARED_WITH_ADMIN = ["lib/uploads.ts"]
const GENERIC = errorMessage(new ORPCError("INTERNAL_SERVER_ERROR", { message: "boom" }))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith(".ts") ? [path] : []
  })
}

function text(node: ts.Expression | undefined): string | null {
  if (!node) return null
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isTemplateExpression(node))
    return node.head.text + node.templateSpans.map((s) => `X${s.literal.text}`).join("")
  return null
}

type Thrown = { where: string; code: string; message: string }

function thrownIn(file: string): Thrown[] {
  const rel = relative(SRC, file)
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const found: Thrown[] = []
  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node) && node.expression.getText(source) === "ORPCError") {
      const [code, options] = node.arguments ?? []
      const message =
        options && ts.isObjectLiteralExpression(options)
          ? options.properties.find((p) => p.name?.getText(source) === "message")
          : undefined
      const value = message && ts.isPropertyAssignment(message) ? text(message.initializer) : null
      if (code && value)
        found.push({
          where: `${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          code: text(code) ?? "",
          message: value,
        })
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "publicError" &&
      SHARED_WITH_ADMIN.includes(rel)
    ) {
      const [code, , message] = node.arguments
      const value = text(message)
      if (code && value)
        found.push({
          where: `${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          code: text(code) ?? "",
          message: value,
        })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

test("every english message the admin api throws reaches the owner in french", () => {
  const files = [...sourceFiles(join(SRC, "routers/admin")), ...sourceFiles(join(SRC, "lib"))]
  const thrown = files.flatMap(thrownIn)
  expect(thrown.length).toBeGreaterThan(10)
  const unmapped = thrown
    .filter(({ code, message }) => errorMessage(new ORPCError(code, { message })) === GENERIC)
    .map(({ where, message }) => `${where} ${message}`)
  expect(unmapped).toEqual([])
})
