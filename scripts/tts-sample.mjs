// Reads one French line aloud with the configured voice so it can be approved before any video exists.
// node --env-file=.env scripts/tts-sample.mjs [out.mp3] ["text"]
import { writeFile } from "node:fs/promises"

const key = process.env.ELEVENLABS_API_KEY
const voice = process.env.ELEVENLABS_VOICE_ID
if (process.env.TTS_PROVIDER !== "elevenlabs" || !key || !voice) {
  console.error("Set TTS_PROVIDER=elevenlabs, ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env first.")
  process.exit(1)
}

const out = process.argv[2] ?? "tts-sample.mp3"
const text =
  process.argv[3] ??
  "Bienvenue dans l'atelier Ceraghit. Dans cette vidéo, nous allons ajouter une nouvelle pièce au catalogue, étape par étape."

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
  body: JSON.stringify({
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  }),
})
if (!res.ok) {
  console.error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}
const audio = Buffer.from(await res.arrayBuffer())
await writeFile(out, audio)
console.log(`${out}: ${audio.length} bytes, ${text.length} characters billed`)
