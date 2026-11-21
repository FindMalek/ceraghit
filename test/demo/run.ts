// Usage: pnpm demo:videos [-- 03 [05 ...]] [--voice] [--zoom] [--burn] [--device=desktop|mobile]
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, devices } from "@playwright/test"
import { type Caption, toSrt, toVtt } from "./lib/captions"
import { assertSafe } from "./lib/guard"
import { installOverlay } from "./lib/overlay"
import { createPacer, DEFAULT_HOLD_MS, STILL_MS, sleep } from "./lib/pacing"
import { type AudioClip, frameSize, mux, startRecording } from "./lib/recorder"
import { type Device, fileBase, parseVideo, stepsFor, type Video } from "./lib/steps"
import { createTts, type Narration } from "./lib/tts"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const out = join(here, "out")
const videosDir = join(here, "videos")

if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"))

const env: Record<string, string | undefined> = process.env
const args = process.argv.slice(2).filter((a) => a !== "--")
const flag = (name: string) => args.includes(`--${name}`)
const only = args.find((a) => a.startsWith("--device="))?.split("=")[1] as Device | undefined
const ids = args.filter((a) => /^\d{2}$/.test(a))

const urls = {
  web: process.env.WEB_URL ?? "http://localhost:3000",
  dashboard: process.env.DASHBOARD_URL ?? "http://localhost:3100",
}

const substitute = (text: string | undefined) =>
  text?.replace(/\{\{(\w+)\}\}/g, (_, name: string) => process.env[name] ?? "")

function loadVideos(): Video[] {
  return readdirSync(videosDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => parseVideo(JSON.parse(readFileSync(join(videosDir, f), "utf8"))))
    .filter((v) => ids.length === 0 || ids.includes(v.id))
}

async function main() {
  await assertSafe(env)
  const videos = loadVideos()
  if (videos.length === 0) throw new Error(`no video matches ${ids.join(", ") || "(none found)"}`)
  mkdirSync(join(out, "videos"), { recursive: true })

  const tts = flag("voice")
    ? createTts({ env, cacheDir: join(out, "tts-cache"), warn: (m) => console.warn(`warning: ${m}`) })
    : null
  const browser = await chromium.launch()
  const produced: string[] = []

  for (const video of videos) {
    for (const device of ["desktop", "mobile"] as const) {
      if (only && only !== device) continue
      const steps = stepsFor(video, device)
      const narrations: Narration[] = []
      if (tts) for (const s of steps) narrations.push(await tts.narrate(s.caption_fr))

      const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"]
      const viewport = device === "desktop" ? { width: 1440, height: 900 } : iphone.viewport
      const context = await browser.newContext(
        device === "desktop"
          ? { viewport, deviceScaleFactor: 2, locale: "fr-FR" }
          : { ...iphone, deviceScaleFactor: 2, locale: "fr-FR" },
      )
      await installOverlay(context)
      const page = await context.newPage()
      if (video.start.loggedIn) {
        await page.goto(`${urls.dashboard}/login`)
        await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL ?? "")
        await page.getByLabel("Mot de passe").fill(process.env.ADMIN_PASSWORD ?? "")
        await page.getByRole("button", { name: "Se connecter" }).click()
        await page.waitForURL((u) => !u.pathname.startsWith("/login"))
      }
      await page.goto(`${urls[video.start.app]}${video.start.path}`)
      await page.waitForLoadState("networkidle")

      const base = fileBase(video, device)
      const raw = join(out, `${base}.raw.mp4`)
      const recording = await startRecording(page, raw, frameSize(viewport ?? { width: 1440, height: 900 }, 2))
      const pacer = createPacer({
        page,
        device,
        app: video.start.app,
        baseUrl: (app) => urls[app],
        assetsDir: join(here, "assets"),
        zoom: flag("zoom"),
      })
      const captions: Caption[] = []
      const clips: AudioClip[] = []
      await sleep(STILL_MS)
      for (const [i, step] of steps.entries()) {
        const startMs = recording.now()
        console.info(`${base} ${i + 1}/${steps.length} ${step.action}`)
        const narration = narrations[i]
        if (narration) clips.push({ file: narration.file, atMs: startMs })
        await pacer.run(step, substitute(step.value))
        const spoken = narration ? narration.durationMs + 250 : 0
        await sleep(Math.max(step.holdMs ?? DEFAULT_HOLD_MS, spoken - (recording.now() - startMs)))
        await pacer.zoomOut()
        captions.push({ startMs, endMs: recording.now(), text: step.caption_fr })
      }
      await sleep(STILL_MS)
      await recording.stop()
      await context.close()

      const finalFile = join(out, "videos", `${base}.mp4`)
      const srt = join(out, "videos", `${base}.fr.srt`)
      writeFileSync(srt, toSrt(captions))
      writeFileSync(join(out, "videos", `${base}.fr.vtt`), toVtt(captions))
      if (steps.every((s) => s.caption_ar)) {
        const ar = steps.map((s, i) => ({ ...(captions[i] as Caption), text: s.caption_ar ?? "" }))
        writeFileSync(join(out, "videos", `${base}.ar.srt`), toSrt(ar))
        writeFileSync(join(out, "videos", `${base}.ar.vtt`), toVtt(ar))
      }
      if (clips.length > 0 || flag("burn")) mux(raw, finalFile, clips, flag("burn") ? srt : undefined)
      else renameSync(raw, finalFile)
      rmSync(raw, { force: true })
      produced.push(finalFile)
      console.info(`wrote ${finalFile}`)
    }
  }
  await browser.close()
  if (tts)
    console.info(`voice: ${tts.provider}, ${tts.billedChars()} characters billed this run (cached lines are free)`)
  console.info(produced.join("\n"))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
