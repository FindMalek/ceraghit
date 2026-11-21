import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
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
  ELEVENLABS_LEDGER?: string
  TTS_CACHE_DIR?: string
}

/** Shared per user, outside any worktree, so every checkout draws on the same credits and cache. */
export const ledgerPath = (env: NarrationEnv): string =>
  env.ELEVENLABS_LEDGER || join(homedir(), ".config", "ceraghit", "demo", "credits.json")
export const ttsCacheDir = (env: NarrationEnv): string =>
  env.TTS_CACHE_DIR || join(homedir(), ".cache", "ceraghit-demo", "tts")

/** The line a step speaks, or null when it is silent. A device-only step speaks only with `voice: true`. */
export function spokenLine(step: Step): string | null {
  if (step.only && !step.voice) return null
  return step.caption_fr.trim().replace(/\s+/g, " ")
}

/** One entry per step of `stepsFor(video, device)`: its line, or null. Both devices map the same step to the same text. */
export function narrationFor(video: Video, device: Device): (string | null)[] {
  return stepsFor(video, device).map(spokenLine)
}

/** The deduped lines a video needs across the given devices, in script order. This is the paid script. */
export function uniqueLines(video: Video, devices: Device[] = DEVICES): string[] {
  const lines = new Set<string>()
  for (const device of devices.filter((d) => !video.devices || video.devices.includes(d)))
    for (const line of narrationFor(video, device)) if (line) lines.add(line)
  return [...lines]
}

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw ? Number(raw) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function creditRate(env: NarrationEnv): { rate: number; model: string; note?: string } {
  const model = env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL
  const known = MODEL_RATES[model]
  const base = known ?? 1
  const note = known === undefined ? `unknown model ${model}: assuming 1 credit per character` : undefined
  if (env.CREDIT_PER_CHAR) {
    const override = Number(env.CREDIT_PER_CHAR)
    if (!Number.isFinite(override) || override <= 0) {
      throw new Error(`CREDIT_PER_CHAR must be a number above 0, got "${env.CREDIT_PER_CHAR}"`)
    }
    return { rate: Math.max(override, base), model, note }
  }
  return { rate: base, model, note }
}

export function parseBudget(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_BUDGET
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`ELEVENLABS_CREDIT_BUDGET must be a plain non-negative number like 29000, got "${raw}"`)
  }
  return Number(raw)
}

export interface LedgerRun {
  id?: string
  at: string
  chars: number
  credits: number
}

export interface Ledger {
  runs: LedgerRun[]
}

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0

/** Counts only: no text, no keys. A missing file is an empty ledger; a corrupt one is an error. */
export function readLedger(file: string): Ledger {
  if (!existsSync(file)) return { runs: [] }
  let parsed: { runs?: unknown }
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new Error(`${file} is not valid JSON: fix or delete it so the credit budget can be trusted`)
  }
  const runs = parsed?.runs
  if (!Array.isArray(runs) || !runs.every((r) => r && valid(r.credits) && valid(r.chars))) {
    throw new Error(
      `${file} has an invalid run (credits and chars must be numbers >= 0): fix it so the credit budget can be trusted`,
    )
  }
  return { runs: runs as LedgerRun[] }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Exclusive lock for a whole paid pass: a second final run fails instead of gating on stale numbers. */
export function lockLedger(file: string): { release(): void } {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const lock = `${file}.lock`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, "wx", 0o600)
      writeSync(fd, String(process.pid))
      closeSync(fd)
      return { release: () => rmSync(lock, { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const pid = Number(readFileSync(lock, "utf8"))
      if (Number.isInteger(pid) && pid > 0 && alive(pid)) {
        throw new Error(`another final narration run (pid ${pid}) holds ${lock}: wait for it to finish`)
      }
      rmSync(lock, { force: true })
    }
  }
  throw new Error(`could not lock ${lock}`)
}

/** Adds billed characters to this run's ledger entry, atomically. Call while holding the lock. */
export function createRunRecorder(file: string, rate: number, now: () => Date = () => new Date()) {
  const id = randomUUID()
  let chars = 0
  return (added: number): void => {
    if (added <= 0) return
    chars += added
    const ledger = readLedger(file)
    const entry = ledger.runs.find((r) => r.id === id)
    const next = { id, at: entry?.at ?? now().toISOString(), chars, credits: Math.ceil(chars * rate) }
    if (entry) Object.assign(entry, next)
    else ledger.runs.push(next)
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${id}.tmp`
    writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  }
}

export interface VideoPlan {
  id: string
  lines: number
  chars: number
  cached: number
  /** Lines already counted in an earlier video of this plan. */
  shared: number
  newChars: number
  newCredits: number
}

export interface Plan {
  videos: VideoPlan[]
  lines: number
  chars: number
  cached: number
  shared: number
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
  const budget = parseBudget(env.ELEVENLABS_CREDIT_BUDGET)
  const spent = ledger.runs.reduce((sum, r) => sum + r.credits, 0)
  const warnings = note ? [note] : []
  const seen = new Set<string>()
  const rows: VideoPlan[] = []
  for (const video of videos) {
    const lines = uniqueLines(video, devices)
    const row: VideoPlan = {
      id: video.id,
      lines: lines.length,
      chars: 0,
      cached: 0,
      shared: 0,
      newChars: 0,
      newCredits: 0,
    }
    for (const line of lines) {
      row.chars += line.length
      if (line.length > maxLine)
        warnings.push(
          `video ${video.id}: line of ${line.length} characters (max ${maxLine}): "${line.slice(0, 40)}..."`,
        )
      if (seen.has(line)) row.shared++
      else if (isCached(line)) row.cached++
      else row.newChars += line.length
      seen.add(line)
    }
    row.newCredits = Math.ceil(row.newChars * rate)
    if (row.chars > maxVideo)
      warnings.push(`video ${video.id}: ${row.chars} spoken characters (max ${maxVideo}), move details to captions`)
    rows.push(row)
  }
  const sum = (key: "lines" | "chars" | "cached" | "shared" | "newChars") => rows.reduce((n, r) => n + r[key], 0)
  return {
    videos: rows,
    lines: sum("lines"),
    chars: sum("chars"),
    cached: sum("cached"),
    shared: sum("shared"),
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
  if (!(plan.newCredits <= plan.remaining)) {
    throw new Error(
      `narration needs ${plan.newCredits} new credits (${plan.newChars} uncached characters x ${plan.rate}) but only ${plan.remaining} are left of ${plan.budget} (${plan.spent} already used). Trim the script, use --voice=draft, or raise ELEVENLABS_CREDIT_BUDGET.`,
    )
  }
}

export function formatPlan(plan: Plan): string {
  const pad = (v: string | number, n: number) => String(v).padStart(n)
  const rows = [`video  lines  chars  cached  shared  new credits`]
  for (const v of plan.videos)
    rows.push(
      `${v.id.padEnd(6)} ${pad(v.lines, 5)}  ${pad(v.chars, 5)}  ${pad(v.cached, 6)}  ${pad(v.shared, 6)}  ${pad(v.newCredits, 11)}`,
    )
  rows.push(
    `total  ${pad(plan.lines, 5)}  ${pad(plan.chars, 5)}  ${pad(plan.cached, 6)}  ${pad(plan.shared, 6)}  ${pad(plan.newCredits, 11)}`,
  )
  rows.push(
    `model ${plan.model}, ${plan.rate} credit per character; cached and shared lines cost 0; only spend made by this tool is counted`,
    `budget ${plan.budget}, already used ${plan.spent}, remaining ${plan.remaining}, after this run ${plan.remaining - plan.newCredits}`,
  )
  for (const w of plan.warnings) rows.push(`warning: ${w}`)
  return rows.join("\n")
}
