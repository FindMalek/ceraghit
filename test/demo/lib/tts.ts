import { type SpawnSyncReturns, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type TtsProvider = "elevenlabs" | "say"

export interface TtsEnv {
  TTS_PROVIDER?: string
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
  ELEVENLABS_MODEL_ID?: string
}

export interface Narration {
  file: string
  durationMs: number
  cached: boolean
}

export interface Tts {
  provider: TtsProvider
  narrate(text: string): Promise<Narration>
  /** Characters sent to a paid provider in this run: cached lines cost nothing. */
  billedChars(): number
}

export interface TtsOptions {
  env: TtsEnv
  cacheDir: string
  fetchFn?: typeof fetch
  /** Renders `text` to `file` with the macOS voice. */
  say?: (text: string, file: string) => void
  duration?: (file: string) => number
  warn?: (message: string) => void
  /** Wait before retrying a 429 from the provider. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_MODEL = "eleven_multilingual_v2"
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75 }

export function pickProvider(env: TtsEnv): { provider: TtsProvider; fellBack: boolean } {
  const explicit = env.TTS_PROVIDER
  if (explicit && explicit !== "say" && explicit !== "elevenlabs") {
    throw new Error(`TTS_PROVIDER must be "say" or "elevenlabs", got "${explicit}"`)
  }
  const wanted: TtsProvider = explicit === "say" ? "say" : "elevenlabs"
  if (wanted === "elevenlabs" && (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID)) {
    if (explicit === "elevenlabs") {
      throw new Error("TTS_PROVIDER=elevenlabs needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID")
    }
    return { provider: "say", fellBack: true }
  }
  return { provider: wanted, fellBack: false }
}

function macSay(text: string, file: string): void {
  const res = spawnSync("say", ["-v", "Thomas", "-o", file, "--file-format=m4af", text])
  if (res.status !== 0) throw new Error("macOS `say -v Thomas` failed, is the French voice installed?")
}

type Spawn = (command: string, args: string[], options: { encoding: "utf8" }) => SpawnSyncReturns<string>

/** Duration of an audio file in ms; throws when ffprobe is missing, fails or prints nothing usable. */
export function probeDuration(file: string, spawn: Spawn = spawnSync): number {
  const command = process.env.FFPROBE || "ffprobe"
  const res = spawn(command, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  })
  const ms = Math.round(Number.parseFloat(res.stdout ?? "") * 1000)
  if (res.error || res.status !== 0 || !Number.isFinite(ms) || ms <= 0) {
    throw new Error(`could not read the narration duration with ${command}, is ffprobe installed?`)
  }
  return ms
}

export function createTts(options: TtsOptions): Tts {
  const { env, cacheDir } = options
  const fetchFn = options.fetchFn ?? fetch
  const say = options.say ?? macSay
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const duration = options.duration ?? probeDuration
  const { provider, fellBack } = pickProvider(env)
  let billed = 0
  if (fellBack) {
    options.warn?.("ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is not set: using the free macOS voice (say -v Thomas)")
  }
  mkdirSync(cacheDir, { recursive: true })
  const model = env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL
  const voice = env.ELEVENLABS_VOICE_ID ?? ""
  const ext = provider === "say" ? "m4a" : "mp3"

  async function render(text: string, file: string): Promise<void> {
    if (provider === "say") {
      const part = `${file}.part`
      say(text, part)
      renameSync(part, file)
      return
    }
    const request = () =>
      fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: VOICE_SETTINGS,
        }),
      })
    let res = await request()
    for (let attempt = 1; res.status === 429 && attempt <= 3; attempt++) {
      await sleep(2000 * attempt)
      res = await request()
    }
    if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`)
    const part = `${file}.part`
    writeFileSync(part, Buffer.from(await res.arrayBuffer()))
    renameSync(part, file)
    billed += text.length
  }

  return {
    provider,
    billedChars: () => billed,
    async narrate(text) {
      const hash = createHash("sha256")
        .update(
          [
            provider,
            provider === "elevenlabs" ? `${voice}|${model}|${JSON.stringify(VOICE_SETTINGS)}` : "thomas",
            text,
          ].join("\n"),
        )
        .digest("hex")
        .slice(0, 24)
      const file = join(cacheDir, `${hash}.${ext}`)
      const cached = existsSync(file) && readFileSync(file).length > 0
      if (!cached) await render(text, file)
      const durationMs = duration(file)
      if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error(`narration ${file} has no usable duration`)
      return { file, durationMs, cached }
    },
  }
}
