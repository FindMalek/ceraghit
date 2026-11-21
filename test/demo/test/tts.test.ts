import { expect, test } from "bun:test"
import { mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTts, pickProvider, probeDuration } from "../lib/tts"

const env = { ELEVENLABS_API_KEY: "test-key-not-real", ELEVENLABS_VOICE_ID: "voice-1" }

function setup(overrides: Partial<Parameters<typeof createTts>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(new Uint8Array([1, 2, 3]))
  }) as unknown as typeof fetch
  const tts = createTts({
    env,
    cacheDir: mkdtempSync(join(tmpdir(), "tts-")),
    fetchFn,
    duration: () => 1000,
    ...overrides,
  })
  return { tts, calls }
}

test("a line is generated once, then served from the cache and billed once", async () => {
  const { tts, calls } = setup()
  const first = await tts.narrate("Bonjour à tous")
  const again = await tts.narrate("Bonjour à tous")
  await tts.narrate("Une autre phrase")
  expect(first.cached).toBe(false)
  expect(again).toMatchObject({ cached: true, file: first.file })
  expect(calls).toHaveLength(2)
  expect(tts.billedChars()).toBe("Bonjour à tous".length + "Une autre phrase".length)
  const sent = calls[0] as { url: string; init: RequestInit }
  expect(sent.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128")
  expect(JSON.parse(String(sent.init.body))).toMatchObject({
    text: "Bonjour à tous",
    model_id: "eleven_flash_v2_5",
  })
})

test("without a key it falls back to the macOS voice and never calls the network", async () => {
  const said: string[] = []
  const warnings: string[] = []
  const { tts, calls } = setup({
    env: {},
    say: (text, file) => {
      said.push(text)
      require("node:fs").writeFileSync(file, "x")
    },
    warn: (m) => warnings.push(m),
  })
  expect(tts.provider).toBe("say")
  await tts.narrate("Bonjour")
  expect(said).toEqual(["Bonjour"])
  expect(calls).toHaveLength(0)
  expect(tts.billedChars()).toBe(0)
  expect(warnings).toHaveLength(1)
})

test("an api error names the status and never the key", async () => {
  const fetchFn = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch
  const { tts } = setup({ fetchFn })
  const error = await tts.narrate("Bonjour").catch((e: Error) => e)
  expect((error as Error).message).toBe("ElevenLabs answered 401")
})

test("a rate limited answer is retried, an error after the retries names only the status", async () => {
  let calls = 0
  const fetchFn = (async () => {
    calls++
    return calls < 3 ? new Response("slow down", { status: 429 }) : new Response(new Uint8Array([1]))
  }) as unknown as typeof fetch
  const { tts } = setup({ fetchFn, sleep: async () => {} })
  await tts.narrate("Bonjour")
  expect(calls).toBe(3)
})

test("an explicit elevenlabs choice without a key or voice fails instead of falling back", () => {
  expect(() => pickProvider({ TTS_PROVIDER: "elevenlabs" })).toThrow("ELEVENLABS_API_KEY")
  expect(() => pickProvider({ TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k" })).toThrow("ELEVENLABS_VOICE_ID")
  expect(() => pickProvider({ TTS_PROVIDER: "eleven" })).toThrow("TTS_PROVIDER")
  expect(pickProvider({})).toEqual({ provider: "say", fellBack: true })
})

test("the key never shows up in an error or a warning", async () => {
  const secret = "sk-secret-value-123"
  const messages: string[] = []
  const fetchFn = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch
  const { tts } = setup({
    env: { ELEVENLABS_API_KEY: secret, ELEVENLABS_VOICE_ID: "v" },
    fetchFn,
    warn: (m) => messages.push(m),
  })
  const error = await tts.narrate("Bonjour").catch((e: Error) => e)
  messages.push((error as Error).message)
  expect(messages.join("\n")).not.toContain(secret)
})

test("a failed download leaves no file in the cache", async () => {
  const fetchFn = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch
  const cacheDir = mkdtempSync(join(tmpdir(), "tts-"))
  const { tts } = setup({ fetchFn, cacheDir })
  await tts.narrate("Bonjour").catch(() => {})
  expect(readdirSync(cacheDir)).toEqual([])
})

test("a finished download is renamed into place, leaving no partial file", async () => {
  const a = setup()
  const first = await a.tts.narrate("Bonjour")
  expect(first.file).not.toContain("part")
  expect(readdirSync(join(first.file, ".."))).toEqual([first.file.split("/").pop() as string])
})

test("a missing or failing ffprobe throws instead of returning NaN", () => {
  const spawn = (result: object) => () => result as never
  expect(() => probeDuration("a.mp3", spawn({ error: new Error("ENOENT"), status: null, stdout: null }))).toThrow(
    "ffprobe",
  )
  expect(() => probeDuration("a.mp3", spawn({ status: 1, stdout: "" }))).toThrow("ffprobe")
  expect(() => probeDuration("a.mp3", spawn({ status: 0, stdout: "N/A\n" }))).toThrow("ffprobe")
  expect(probeDuration("a.mp3", spawn({ status: 0, stdout: "1.5\n" }))).toBe(1500)
})

test("a narration without a usable duration stops before the video is mixed", async () => {
  const { tts } = setup({ duration: () => Number.NaN })
  await expect(tts.narrate("Bonjour")).rejects.toThrow("duration")
})
