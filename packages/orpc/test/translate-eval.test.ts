import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { main } from "../../../scripts/translate-eval"
import type { TranslateFn } from "../src/lib/translate/eval"

const fake: TranslateFn = async (_column, request) => ({
  output: Object.fromEntries(request.targets.map((lang) => [lang, lang === "ar" ? "مزهرية" : request.source.text])),
  error: null,
  latencyMs: 5,
  inputTokens: 100,
  outputTokens: 50,
})

test("the eval needs a key and never calls the network without one", async () => {
  expect(await main([], {})).toBe(1)
})

test("an offline run scores every candidate on the fixed sample set and writes the report", async () => {
  const out = mkdtempSync(join(tmpdir(), "eval-"))
  expect(await main(["--limit", "5", "--out", out], {}, fake)).toBe(0)
  const file = join(out, `translate-eval-${new Date().toISOString().slice(0, 10)}.md`)
  const report = readFileSync(file, "utf8")
  for (const column of ["GPT-OSS 120B low", "GPT-OSS 120B medium", "GPT-OSS 20B low"]) expect(report).toContain(column)
  expect(report).toContain("fr→ar")
  expect(report).toContain("5 samples")
})
