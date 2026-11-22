import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  type EvalColumn,
  formatReport,
  groqTranslate,
  runEval,
  type TranslateFn,
} from "../packages/orpc/src/lib/translate/eval"
import { AI_MODELS, EVAL_ONLY_MODELS } from "../packages/orpc/src/lib/translate/models"
import { collectSamples } from "./translate-eval.fixtures"

/** The eval waits out 429 backoff (4 retries) instead of failing a sample at the owner-facing 30 s. */
const EVAL_TIMEOUT_MS = 300_000

const USAGE = "usage: bun scripts/translate-eval.ts [--models a,b] [--limit 20] [--with-preview] [--with-reference]"

export function evalColumns({ models, withPreview }: { models?: string; withPreview?: boolean }): EvalColumn[] {
  const columns: EvalColumn[] = [
    { model: "openai/gpt-oss-120b", effort: "low" },
    { model: "openai/gpt-oss-120b", effort: "medium" },
    { model: "openai/gpt-oss-20b", effort: "low" },
  ]
  if (withPreview) columns.push({ model: "qwen/qwen3.8-27b", effort: "default" })
  if (!models) return columns
  const wanted = models.split(",").map((model) => model.trim())
  const known = new Set<string>([...Object.keys(AI_MODELS), ...Object.keys(EVAL_ONLY_MODELS)])
  const unknown = wanted.filter((model) => !known.has(model))
  if (unknown.length > 0) throw new Error(`unknown model: ${unknown.join(", ")}`)
  return columns.filter((column) => wanted.includes(column.model))
}

export async function main(argv: string[], env: Record<string, string | undefined>, translate?: TranslateFn) {
  const { values } = parseArgs({
    args: argv,
    options: {
      models: { type: "string" },
      limit: { type: "string" },
      "with-preview": { type: "boolean" },
      "with-reference": { type: "boolean" },
      out: { type: "string", default: join(import.meta.dir, "out") },
    },
  })
  const apiKey = env.GROQ_API_KEY?.trim()
  if (!translate && !apiKey) {
    console.error(`GROQ_API_KEY is not set. Export it in your shell first (it is never printed).\n${USAGE}`)
    return 1
  }
  let columns: EvalColumn[]
  try {
    columns = evalColumns({ models: values.models, withPreview: values["with-preview"] })
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`)
    return 1
  }
  const limit = values.limit ? Number(values.limit) : undefined
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    console.error(`--limit must be a positive whole number.\n${USAGE}`)
    return 1
  }
  const samples = collectSamples().slice(0, limit)
  const total = columns.length * samples.length
  let done = 0
  let last: unknown
  const results = await runEval({
    samples,
    columns,
    translate: translate ?? groqTranslate(apiKey as string, undefined, EVAL_TIMEOUT_MS),
    delayMs: translate ? 0 : 250,
    onCall: (column, sample) => {
      if (sample === last) return
      last = sample
      done++
      process.stderr.write(`\r${column.model} ${column.effort}: ${done}/${total} samples`)
    },
  })
  process.stderr.write("\n")
  const date = new Date().toISOString().slice(0, 10)
  const report = formatReport(results, {
    title: `Translation eval ${date}, ${samples.length} samples`,
    withReference: values["with-reference"],
  })
  mkdirSync(values.out, { recursive: true })
  const file = join(values.out, `translate-eval-${date}.md`)
  writeFileSync(file, report)
  console.log(report)
  console.log(`written to ${file}`)
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), process.env)
}
