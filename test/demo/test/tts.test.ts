import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTts } from "../lib/tts"

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
    model_id: "eleven_multilingual_v2",
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
  expect(warnings.join()).not.toContain("test-key")
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
