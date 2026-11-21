import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
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

export function pickProvider(env: TtsEnv): { provider: TtsProvider; fellBack: boolean } {
  const wanted = env.TTS_PROVIDER === "say" ? "say" : "elevenlabs"
  if (wanted === "elevenlabs" && (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID)) {
    return { provider: "say", fellBack: true }
  }
  return { provider: wanted, fellBack: false }
}

function macSay(text: string, file: string): void {
  const res = spawnSync("say", ["-v", "Thomas", "-o", file, "--file-format=m4af", text])
  if (res.status !== 0) throw new Error("macOS `say -v Thomas` failed, is the French voice installed?")
}

function probeDuration(file: string): number {
  const res = spawnSync(
    process.env.FFPROBE || "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    {
      encoding: "utf8",
    },
  )
  return Math.round(Number.parseFloat(res.stdout) * 1000)
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
      say(text, file)
      return
    }
    const request = () =>
      fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })
    let res = await request()
    for (let attempt = 1; res.status === 429 && attempt <= 3; attempt++) {
      await sleep(2000 * attempt)
      res = await request()
    }
    if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    billed += text.length
  }

  return {
    provider,
    billedChars: () => billed,
    async narrate(text) {
      const hash = createHash("sha256")
        .update([provider, provider === "elevenlabs" ? `${voice}|${model}` : "thomas", text].join("\n"))
        .digest("hex")
        .slice(0, 24)
      const file = join(cacheDir, `${hash}.${ext}`)
      const cached = existsSync(file) && readFileSync(file).length > 0
      if (!cached) await render(text, file)
      return { file, durationMs: duration(file), cached }
    },
  }
}
