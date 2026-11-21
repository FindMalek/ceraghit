import { spawnSync } from "node:child_process"
import type { VoiceMode } from "./args"
import {
  assertBudget,
  buildPlan,
  createRunRecorder,
  creditRate,
  lockLedger,
  type NarrationEnv,
  readLedger,
  uniqueLines,
} from "./narration"
import type { Device, Video } from "./steps"
import { createTts, type Narration, type TtsEnv, type TtsOptions } from "./tts"

export interface VoiceOptions {
  voice: VoiceMode | undefined
  videos: Video[]
  device?: Device
  env: NarrationEnv & TtsEnv
  cacheDir: string
  ledgerFile: string
  fetchFn?: typeof fetch
  say?: TtsOptions["say"]
  duration?: TtsOptions["duration"]
  warn?: (message: string) => void
  /** Throws when the audio tooling is missing; runs before anything is generated. */
  probe?: () => void
  recorder?: typeof createRunRecorder
  /** Install SIGINT/SIGTERM handlers that release the lock (the ledger is already written line by line). */
  handleSignals?: boolean
}

export function probeFfprobe(): void {
  const command = process.env.FFPROBE || "ffprobe"
  const res = spawnSync(command, ["-version"], { encoding: "utf8" })
  if (res.error || res.status !== 0)
    throw new Error(`${command} is not available: install ffmpeg before generating narration`)
}

/** Generates every spoken line once (both devices share the clips). Only `final` spends credits. */
export async function prepareVoice(options: VoiceOptions): Promise<Map<string, Narration>> {
  const { voice, videos, device, env } = options
  const clips = new Map<string, Narration>()
  if (!voice) return clips
  const devices = device ? [device] : undefined
  const final = voice === "final"
  const rate = final ? creditRate(env).rate : 0
  ;(options.probe ?? probeFfprobe)()
  const tts = createTts({
    env: { ...env, TTS_PROVIDER: final ? "elevenlabs" : "say" },
    cacheDir: options.cacheDir,
    fetchFn: options.fetchFn,
    say: options.say,
    duration: options.duration,
    warn: options.warn,
  })
  const lock = final ? lockLedger(options.ledgerFile) : null
  const onSignal = (signal: NodeJS.Signals) => {
    lock?.release()
    process.exit(signal === "SIGINT" ? 130 : 143)
  }
  if (lock && options.handleSignals) for (const s of ["SIGINT", "SIGTERM"] as const) process.once(s, onSignal)
  let recorded = 0
  const record = final ? (options.recorder ?? createRunRecorder)(options.ledgerFile, rate) : () => {}
  const flush = () => {
    const delta = tts.billedChars() - recorded
    if (delta <= 0) return
    record(delta)
    recorded += delta
  }
  let failure: { error: unknown } | undefined
  try {
    if (final) {
      assertBudget(
        buildPlan(videos, { env, ledger: readLedger(options.ledgerFile), devices, isCached: (t) => tts.isCached(t) }),
      )
    }
    for (const video of videos) {
      for (const line of uniqueLines(video, devices)) {
        if (clips.has(line)) continue
        clips.set(line, await tts.narrate(line))
        flush()
      }
    }
  } catch (error) {
    failure = { error }
  }
  // A line can be billed and then fail (duration probe): record it anyway, without hiding the original error.
  try {
    flush()
  } catch (error) {
    if (failure) options.warn?.(`could not record the credit ledger: ${error instanceof Error ? error.message : error}`)
    else failure = { error }
  }
  if (options.handleSignals) for (const s of ["SIGINT", "SIGTERM"] as const) process.removeListener(s, onSignal)
  lock?.release()
  if (failure) throw failure.error
  return clips
}
