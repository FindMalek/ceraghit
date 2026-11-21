import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { type Device, type Step, stepsFor, type Video } from "./steps"
import { DEFAULT_MODEL } from "./tts"

const DEVICES: Device[] = ["desktop", "mobile"]

export const DEFAULT_BUDGET = 29000
export const DEFAULT_MAX_LINE = 140
export const DEFAULT_MAX_VIDEO = 700

/** Credits per character by ElevenLabs model. */
const MODEL_RATES: Record<string, number> = {
  eleven_multilingual_v2: 1,
  eleven_flash_v2_5: 0.5,
  eleven_turbo_v2_5: 0.5,
}

export interface NarrationEnv {
  CREDIT_PER_CHAR?: string
  ELEVENLABS_MODEL_ID?: string
  ELEVENLABS_CREDIT_BUDGET?: string
  NARRATION_MAX_LINE?: string
  NARRATION_MAX_VIDEO?: string
}

/** The line a step speaks, or null when it is silent. A device-only step speaks only with `voice: true`. */
export function spokenLine(step: Step): string | null {
  if (step.only && !step.voice) return null
  return step.caption_fr
}

/** One entry per step of `stepsFor(video, device)`: its line, or null. Both devices map the same step to the same text. */
export function narrationFor(video: Video, device: Device): (string | null)[] {
  return stepsFor(video, device).map(spokenLine)
}

/** The deduped lines a video needs across the given devices, in script order. This is the paid script. */
export function uniqueLines(video: Video, devices: Device[] = DEVICES): string[] {
  const lines = new Set<string>()
  for (const device of devices) for (const line of narrationFor(video, device)) if (line) lines.add(line)
  return [...lines]
}

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw ? Number(raw) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function creditRate(env: NarrationEnv): { rate: number; model: string; note?: string } {
  const model = env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL
  if (env.CREDIT_PER_CHAR) return { rate: positive(env.CREDIT_PER_CHAR, 1), model }
  const known = MODEL_RATES[model]
  if (known !== undefined) return { rate: known, model }
  return { rate: 1, model, note: `unknown model ${model}: assuming 1 credit per character (set CREDIT_PER_CHAR)` }
}

export interface Ledger {
  runs: { at: string; chars: number; credits: number }[]
}

/** Counts only: no text, no keys. */
export function readLedger(file: string): Ledger {
  if (!existsSync(file)) return { runs: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Ledger
    return { runs: Array.isArray(parsed.runs) ? parsed.runs : [] }
  } catch {
    throw new Error(`${file} is not valid JSON: fix or delete it so the credit budget can be trusted`)
  }
}

export function recordRun(file: string, chars: number, rate: number, now = new Date()): void {
  if (chars <= 0) return
  const ledger = readLedger(file)
  ledger.runs.push({ at: now.toISOString(), chars, credits: Math.ceil(chars * rate) })
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`)
}

export interface VideoPlan {
  id: string
  lines: number
  chars: number
  cached: number
  newChars: number
  newCredits: number
}

export interface Plan {
  videos: VideoPlan[]
  lines: number
  chars: number
  cached: number
  newChars: number
  newCredits: number
  budget: number
  spent: number
  remaining: number
  rate: number
  model: string
  warnings: string[]
}

export interface PlanOptions {
  env: NarrationEnv
  ledger: Ledger
  isCached: (text: string) => boolean
  devices?: Device[]
}

export function buildPlan(videos: Video[], options: PlanOptions): Plan {
  const { env, ledger, isCached, devices } = options
  const { rate, model, note } = creditRate(env)
  const maxLine = positive(env.NARRATION_MAX_LINE, DEFAULT_MAX_LINE)
  const maxVideo = positive(env.NARRATION_MAX_VIDEO, DEFAULT_MAX_VIDEO)
  const budget = positive(env.ELEVENLABS_CREDIT_BUDGET, DEFAULT_BUDGET)
  const spent = ledger.runs.reduce((sum, r) => sum + r.credits, 0)
  const warnings = note ? [note] : []
  const seen = new Set<string>()
  const rows: VideoPlan[] = []
  for (const video of videos) {
    const lines = uniqueLines(video, devices)
    const row: VideoPlan = { id: video.id, lines: lines.length, chars: 0, cached: 0, newChars: 0, newCredits: 0 }
    for (const line of lines) {
      row.chars += line.length
      if (line.length > maxLine)
        warnings.push(
          `video ${video.id}: line of ${line.length} characters (max ${maxLine}): "${line.slice(0, 40)}..."`,
        )
      if (seen.has(line) || isCached(line)) row.cached++
      else row.newChars += line.length
      seen.add(line)
    }
    row.newCredits = Math.ceil(row.newChars * rate)
    if (row.chars > maxVideo)
      warnings.push(`video ${video.id}: ${row.chars} spoken characters (max ${maxVideo}), move details to captions`)
    rows.push(row)
  }
  const sum = (key: "lines" | "chars" | "cached" | "newChars") => rows.reduce((n, r) => n + r[key], 0)
  return {
    videos: rows,
    lines: sum("lines"),
    chars: sum("chars"),
    cached: sum("cached"),
    newChars: sum("newChars"),
    newCredits: Math.ceil(sum("newChars") * rate),
    budget,
    spent,
    remaining: budget - spent,
    rate,
    model,
    warnings,
  }
}

/** Throws before any paid call when the new credits do not fit in what is left. */
export function assertBudget(plan: Plan): void {
  if (plan.newCredits > plan.remaining) {
    throw new Error(
      `narration needs ${plan.newCredits} new credits (${plan.newChars} uncached characters x ${plan.rate}) but only ${plan.remaining} are left of ${plan.budget} (${plan.spent} already used). Trim the script, use --voice=draft, or raise ELEVENLABS_CREDIT_BUDGET.`,
    )
  }
}

export function formatPlan(plan: Plan): string {
  const pad = (v: string | number, n: number) => String(v).padStart(n)
  const rows = [`video  lines  chars  cached  new credits`]
  for (const v of plan.videos)
    rows.push(`${v.id.padEnd(6)} ${pad(v.lines, 5)}  ${pad(v.chars, 5)}  ${pad(v.cached, 6)}  ${pad(v.newCredits, 11)}`)
  rows.push(`total  ${pad(plan.lines, 5)}  ${pad(plan.chars, 5)}  ${pad(plan.cached, 6)}  ${pad(plan.newCredits, 11)}`)
  rows.push(
    `model ${plan.model}, ${plan.rate} credit per character; cached lines cost 0`,
    `budget ${plan.budget}, already used ${plan.spent}, remaining ${plan.remaining}, after this run ${plan.remaining - plan.newCredits}`,
  )
  for (const w of plan.warnings) rows.push(`warning: ${w}`)
  return rows.join("\n")
}
