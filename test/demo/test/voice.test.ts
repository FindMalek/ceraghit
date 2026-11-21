import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildPlan, readLedger } from "../lib/narration"
import { parseVideo } from "../lib/steps"
import { createTts, planIsCached } from "../lib/tts"
import { prepareVoice, type VoiceOptions } from "../lib/voice"

const video = (lines: string[]) =>
  parseVideo({
    id: "01",
    slug: "x",
    title_fr: "X",
    start: { app: "web", path: "/", loggedIn: false },
    steps: lines.map((caption_fr) => ({ action: "wait", caption_fr })),
  })

function setup(over: Partial<VoiceOptions> = {}, fetchStatus: (n: number) => number = () => 200) {
  const dir = mkdtempSync(join(tmpdir(), "voice-"))
  const calls: string[] = []
  const said: string[] = []
  const fetchFn = (async (_url: string, init: RequestInit) => {
    calls.push(String(JSON.parse(String(init.body)).text))
    return new Response(new Uint8Array([1]), { status: fetchStatus(calls.length) })
  }) as unknown as typeof fetch
  const options: VoiceOptions = {
    voice: "final",
    videos: [video(["aaaa", "bbbb", "cccc"])],
    env: { ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" },
    cacheDir: join(dir, "cache"),
    ledgerFile: join(dir, "cfg", "credits.json"),
    fetchFn,
    say: (text, file) => {
      said.push(text)
      require("node:fs").writeFileSync(file, "x")
    },
    duration: () => 1000,
    probe: () => {},
    ...over,
  }
  return { options, calls, said, dir }
}

test("bare or draft voice and the plan never call the paid API", async () => {
  for (const voice of ["draft" as const, undefined]) {
    const { options, calls, said } = setup({ voice })
    await prepareVoice(options)
    expect(calls).toHaveLength(0)
    expect(said).toHaveLength(voice ? 3 : 0)
    expect(existsSync(options.ledgerFile)).toBe(false)
  }
  const { options, calls } = setup()
  buildPlan(options.videos, {
    env: options.env,
    ledger: { runs: [] },
    isCached: planIsCached(options.cacheDir, options.env),
  })
  expect(calls).toHaveLength(0)
})

test("a refused final run bills nothing, spends nothing and frees the lock", async () => {
  const { options, calls } = setup({
    env: { ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v", ELEVENLABS_CREDIT_BUDGET: "5" },
  })
  await expect(prepareVoice(options)).rejects.toThrow("needs 6 new credits")
  expect(calls).toHaveLength(0)
  expect(existsSync(options.ledgerFile)).toBe(false)
  expect(existsSync(`${options.ledgerFile}.lock`)).toBe(false)
})

test("a final run records each billed line, even when a later line fails", async () => {
  const { options, calls } = setup({}, (n) => (n === 2 ? 500 : 200))
  await expect(prepareVoice(options)).rejects.toThrow("ElevenLabs answered 500")
  expect(calls).toHaveLength(2)
  expect(readLedger(options.ledgerFile).runs[0]).toMatchObject({ chars: 4, credits: 2 })
  expect(existsSync(`${options.ledgerFile}.lock`)).toBe(false)
})

test("a billed line whose duration probe fails is still recorded, and a failing ledger does not mask the error", async () => {
  const a = setup({ duration: () => Number.NaN })
  await expect(prepareVoice(a.options)).rejects.toThrow("no usable duration")
  expect(readLedger(a.options.ledgerFile).runs[0]).toMatchObject({ chars: 4 })

  const warnings: string[] = []
  const b = setup({
    duration: () => Number.NaN,
    warn: (m) => warnings.push(m),
    recorder: () => () => {
      throw new Error("disk full")
    },
  })
  await expect(prepareVoice(b.options)).rejects.toThrow("no usable duration")
  expect(warnings.join()).toContain("disk full")
})

test("a missing ffprobe stops the run before any paid call", async () => {
  const { options, calls } = setup({
    probe: () => {
      throw new Error("ffprobe is not available")
    },
  })
  await expect(prepareVoice(options)).rejects.toThrow("ffprobe is not available")
  expect(calls).toHaveLength(0)
  expect(existsSync(options.ledgerFile)).toBe(false)
})

test("a second final run is refused while one holds the ledger", async () => {
  const first = setup({ videos: [video(["aaaa"])] })
  const slow = prepareVoice({ ...first.options, duration: () => 1000 })
  // the first call reaches its first await holding the lock
  await expect(prepareVoice({ ...first.options })).rejects.toThrow("holds")
  await slow
})

test("the plan's cache check agrees with the file narrate writes", async () => {
  const { options } = setup()
  const tts = createTts({
    env: options.env,
    cacheDir: options.cacheDir,
    fetchFn: options.fetchFn,
    duration: () => 1000,
  })
  const isCached = planIsCached(options.cacheDir, options.env)
  expect(isCached("aaaa")).toBe(false)
  const { file } = await tts.narrate("aaaa")
  expect(isCached("aaaa")).toBe(true)
  expect(readdirSync(options.cacheDir).map((f) => join(options.cacheDir, f))).toContain(file)
  expect(isCached("bbbb")).toBe(false)
  expect(readFileSync(file).length).toBeGreaterThan(0)
})

test("spend is written as each line is billed, before the next paid call", async () => {
  const seen: number[] = []
  const ctx = setup()
  await prepareVoice({
    ...ctx.options,
    recorder: () => () => seen.push(ctx.calls.length),
  })
  expect(seen).toEqual([1, 2, 3])
})
