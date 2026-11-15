import { createGroq } from "@ai-sdk/groq"
import { generateText, type LanguageModel, Output } from "ai"
import { costUsd, type EvalModelId, modelInfo, type ReasoningEffort } from "./models"
import { buildTranslatePrompt, type Lang, type TranslateRequest, translationSchema } from "./prompt"
import { lengthRatio, percentile, roundTripSimilarity, scoreArabicScript, scoreGlossary, scoreKeep } from "./score"

export interface EvalSample {
  id: string
  field: string
  maxLength: number
  fr: string
  /** Human en/ar from the seed, for manual reading only. */
  reference?: { en: string; ar: string }
}

export interface EvalColumn {
  model: EvalModelId
  /** Qwen on Groq only takes `default` or `none`. */
  effort: ReasoningEffort | "default"
}

export interface CallResult {
  output: Partial<Record<Lang, string>> | null
  error: string | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
}

export type TranslateFn = (column: EvalColumn, request: TranslateRequest) => Promise<CallResult>

export async function translateWith(
  model: LanguageModel,
  effort: EvalColumn["effort"],
  request: TranslateRequest,
): Promise<CallResult> {
  const { system, prompt } = buildTranslatePrompt(request)
  const started = performance.now()
  try {
    const result = await generateText({
      model,
      instructions: system,
      prompt,
      output: Output.object({ schema: translationSchema(request.targets) }),
      providerOptions: { groq: { reasoningEffort: effort, structuredOutputs: true, strictJsonSchema: true } },
      maxRetries: 4,
    })
    return {
      output: result.output as Partial<Record<Lang, string>>,
      error: null,
      latencyMs: performance.now() - started,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    }
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error.name : "UnknownError",
      latencyMs: performance.now() - started,
      inputTokens: 0,
      outputTokens: 0,
    }
  }
}

export function groqTranslate(apiKey: string): TranslateFn {
  const groq = createGroq({ apiKey })
  return (column, request) => translateWith(groq(column.model), column.effort, request)
}

export interface SampleRecord {
  sample: EvalSample
  forward: CallResult
  backFromEn: CallResult | null
  backFromAr: CallResult | null
}

export interface ColumnResult {
  column: EvalColumn
  records: SampleRecord[]
}

export async function runEval({
  samples,
  columns,
  translate,
  delayMs = 0,
  onCall,
}: {
  samples: EvalSample[]
  columns: EvalColumn[]
  translate: TranslateFn
  delayMs?: number
  onCall?: (column: EvalColumn, sample: EvalSample) => void
}): Promise<ColumnResult[]> {
  const call = async (column: EvalColumn, sample: EvalSample, request: TranslateRequest) => {
    onCall?.(column, sample)
    const result = await translate(column, request)
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return result
  }
  const results: ColumnResult[] = []
  for (const column of columns) {
    const records: SampleRecord[] = []
    for (const sample of samples) {
      const base = { field: sample.field, maxLength: sample.maxLength }
      const forward = await call(column, sample, {
        ...base,
        source: { lang: "fr", text: sample.fr },
        targets: ["en", "ar"],
      })
      const back = (lang: "en" | "ar") => {
        const text = forward.output?.[lang]
        return text ? call(column, sample, { ...base, source: { lang, text }, targets: ["fr"] }) : null
      }
      records.push({ sample, forward, backFromEn: await back("en"), backFromAr: await back("ar") })
    }
    results.push({ column, records })
  }
  return results
}

type Task = "fr→en" | "fr→ar" | "en→fr" | "ar→fr"

export interface TaskScore {
  task: Task
  ok: number
  failures: number
  lengthMedian: number | null
  lengthWithin25: number | null
  keep: number | null
  arabicValid: number | null
  maxLengthOk: number | null
  glossary: number | null
  roundTrip: number | null
}

export interface CallStats {
  calls: number
  failures: number
  p50Ms: number | null
  p95Ms: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length
}

function share(values: boolean[]): number | null {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length
}

function scoreForward(records: SampleRecord[], lang: "en" | "ar"): TaskScore {
  const done = records.flatMap(({ sample, forward }) => {
    const text = forward.output?.[lang]
    return text === undefined ? [] : [{ sample, text }]
  })
  const ratios = done.map(({ sample, text }) => lengthRatio(sample.fr, text)).filter((r): r is number => r !== null)
  return {
    task: `fr→${lang}`,
    ok: done.length,
    failures: records.length - done.length,
    lengthMedian: percentile(ratios, 50),
    lengthWithin25: share(ratios.map((ratio) => Math.abs(ratio - 1) <= 0.25)),
    keep: mean(done.map(({ sample, text }) => scoreKeep(sample.fr, text))),
    arabicValid: lang === "ar" ? share(done.map(({ text }) => scoreArabicScript(text).valid)) : null,
    maxLengthOk: share(done.map(({ sample, text }) => text.length <= sample.maxLength)),
    glossary: mean(done.map(({ sample, text }) => scoreGlossary(sample.fr, text, lang))),
    roundTrip: null,
  }
}

function scoreBack(records: SampleRecord[], from: "en" | "ar"): TaskScore {
  const attempted = records.filter((record) => (from === "en" ? record.backFromEn : record.backFromAr) !== null)
  const done = attempted.flatMap((record) => {
    const text = (from === "en" ? record.backFromEn : record.backFromAr)?.output?.fr
    return text === undefined ? [] : [{ sample: record.sample, text }]
  })
  return {
    task: `${from}→fr`,
    ok: done.length,
    failures: attempted.length - done.length,
    lengthMedian: null,
    lengthWithin25: null,
    keep: mean(done.map(({ sample, text }) => scoreKeep(sample.fr, text))),
    arabicValid: null,
    maxLengthOk: null,
    glossary: null,
    roundTrip: mean(done.map(({ sample, text }) => roundTripSimilarity(sample.fr, text))),
  }
}

export function scoreColumn(result: ColumnResult): { tasks: TaskScore[]; stats: CallStats } {
  const calls = result.records.flatMap((record) =>
    [record.forward, record.backFromEn, record.backFromAr].filter((call): call is CallResult => call !== null),
  )
  const latencies = calls.map((call) => call.latencyMs)
  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0)
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0)
  return {
    tasks: [
      scoreForward(result.records, "en"),
      scoreForward(result.records, "ar"),
      scoreBack(result.records, "en"),
      scoreBack(result.records, "ar"),
    ],
    stats: {
      calls: calls.length,
      failures: calls.filter((call) => call.output === null).length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      inputTokens,
      outputTokens,
      costUsd: costUsd(result.column.model, inputTokens, outputTokens),
    },
  }
}

const pct = (value: number | null) => (value === null ? "-" : `${Math.round(value * 100)}%`)
const num = (value: number | null, digits = 2) => (value === null ? "-" : value.toFixed(digits))
const columnName = (column: EvalColumn) => `${modelInfo(column.model).label} ${column.effort}`

function table(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n")
}

export function formatReport(
  results: ColumnResult[],
  {
    title,
    samplesPerModel = 3,
    withReference = false,
  }: { title: string; samplesPerModel?: number; withReference?: boolean },
): string {
  const scored = results.map((result) => ({ result, ...scoreColumn(result) }))
  const quality = table(
    ["model", "task", "ok", "fail", "len median", "len ±25%", "keep", "ar script", "max len", "glossary", "round trip"],
    scored.flatMap(({ result, tasks }) =>
      tasks.map((task) => [
        columnName(result.column),
        task.task,
        String(task.ok),
        String(task.failures),
        num(task.lengthMedian),
        pct(task.lengthWithin25),
        pct(task.keep),
        pct(task.arabicValid),
        pct(task.maxLengthOk),
        pct(task.glossary),
        pct(task.roundTrip),
      ]),
    ),
  )
  const cost = table(
    ["model", "calls", "fail", "p50 ms", "p95 ms", "tokens in", "tokens out", "cost USD"],
    scored.map(({ result, stats }) => [
      columnName(result.column),
      String(stats.calls),
      String(stats.failures),
      num(stats.p50Ms, 0),
      num(stats.p95Ms, 0),
      String(Math.round(stats.inputTokens)),
      String(Math.round(stats.outputTokens)),
      stats.costUsd.toFixed(4),
    ]),
  )
  const arabic = scored.map(({ result }) => {
    const lines = result.records
      .filter((record) => record.forward.output?.ar)
      .slice(0, samplesPerModel)
      .map((record) => `- ${record.sample.fr}\n  → ${record.forward.output?.ar}`)
    return `### ${columnName(result.column)}\n\n${lines.join("\n") || "- no output"}`
  })
  const parts = [`# ${title}`, "## Quality", quality, "## Latency and cost", cost, "## Arabic samples", ...arabic]
  if (withReference) {
    const first = results[0]
    const lines = (first?.records ?? [])
      .filter((record) => record.sample.reference)
      .slice(0, 5)
      .map(
        (record) =>
          `- ${record.sample.fr}\n  human en: ${record.sample.reference?.en}\n  model en: ${record.forward.output?.en ?? "-"}\n  human ar: ${record.sample.reference?.ar}\n  model ar: ${record.forward.output?.ar ?? "-"}`,
      )
    parts.push(`## Human reference (${first ? columnName(first.column) : "-"})`, lines.join("\n") || "- none")
  }
  return `${parts.join("\n\n")}\n`
}
