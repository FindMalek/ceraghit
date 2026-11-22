// Usage: pnpm demo:videos [-- 34 [35 ...]] [--plan] [--voice[=draft|final]] [--zoom] [--burn] [--device=desktop|mobile]
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, devices } from "@playwright/test"
import { parseArgs } from "./lib/args"
import { generateAssets } from "./lib/assets"
import { type Caption, toSrt, toVtt } from "./lib/captions"
import { assertAdminCredentials, assertSafe } from "./lib/guard"
import { buildPlan, formatPlan, ledgerPath, narrationFor, readLedger, ttsCacheDir } from "./lib/narration"
import { installOverlay } from "./lib/overlay"
import { createPacer, DEFAULT_HOLD_MS, STILL_MS, sleep } from "./lib/pacing"
import { type AudioClip, frameSize, mux, startRecording } from "./lib/recorder"
import { applyTimeouts, durationProblem, stepHoldMs, tailWaitMs, VIDEO_DEADLINE_MS, withDeadline } from "./lib/safety"
import { fileBase, parseVideo, stepsFor, type Video } from "./lib/steps"
import { planIsCached, probeDuration } from "./lib/tts"
import { prepareVoice } from "./lib/voice"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const out = join(here, "out")
const videosDir = join(here, "videos")

if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"))

const env: Record<string, string | undefined> = process.env
const { flags, voice, device: only, ids } = parseArgs(process.argv.slice(2))
const flag = (name: string) => flags.has(name)

const urls = {
  web: env.WEB_URL || "http://localhost:3000",
  dashboard: env.DASHBOARD_URL || "http://localhost:3100",
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

const ledgerFile = ledgerPath(env)
const cacheDir = ttsCacheDir(env)

async function main() {
  if (flag("plan")) {
    const planned = loadVideos()
    if (planned.length === 0) throw new Error(`no video matches ${ids.join(", ") || "(none found)"}`)
    const plan = buildPlan(planned, {
      env,
      ledger: readLedger(ledgerFile),
      devices: only ? [only] : undefined,
      isCached: planIsCached(cacheDir, env),
    })
    console.info(formatPlan(plan))
    return
  }
  await assertSafe({ ...env, WEB_URL: urls.web, DASHBOARD_URL: urls.dashboard })
  const videos = loadVideos()
  if (videos.length === 0) throw new Error(`no video matches ${ids.join(", ") || "(none found)"}`)
  if (videos.some((v) => v.start.loggedIn)) assertAdminCredentials(env)
  mkdirSync(join(out, "videos"), { recursive: true })
  const assets = generateAssets(join(out, "assets"))
  if (assets.skipped.length > 0)
    console.warn(`warning: no webp encoder in ffmpeg, skipped ${assets.skipped.join(", ")}`)

  const clips = await prepareVoice({
    voice,
    videos,
    device: only,
    env,
    cacheDir,
    ledgerFile,
    warn: (m) => console.warn(`warning: ${m}`),
    handleSignals: true,
  })
  const browser = await chromium.launch()
  const produced: string[] = []

  for (const video of videos) {
    for (const device of ["desktop", "mobile"] as const) {
      if (only && only !== device) continue
      if (video.devices && !video.devices.includes(device)) continue
      const steps = stepsFor(video, device)
      const lines = narrationFor(video, device)

      const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"]
      const viewport = device === "desktop" ? { width: 1440, height: 900 } : iphone.viewport
      const context = await browser.newContext(
        device === "desktop"
          ? { viewport, deviceScaleFactor: 2, locale: "fr-FR" }
          : { ...iphone, deviceScaleFactor: 2, locale: "fr-FR" },
      )
      await installOverlay(context)
      const base = fileBase(video, device)
      const raw = join(out, `${base}.raw.mp4`)
      const finalFile = join(out, "videos", `${base}.mp4`)
      const written: string[] = []
      let current = "opening the page"
      let expectedMs = 3 * STILL_MS
      const record = async (): Promise<void> => {
        const page = await context.newPage()
        applyTimeouts(page)
        if (video.start.loggedIn) {
          await page.goto(`${urls.dashboard}/login`)
          await page.getByLabel("Email").fill(env.ADMIN_EMAIL ?? "")
          await page.getByLabel("Mot de passe").fill(env.ADMIN_PASSWORD ?? "")
          await page.getByRole("button", { name: "Se connecter" }).click()
          await page.waitForURL((u) => !u.pathname.startsWith("/login"))
        }
        await page.goto(`${urls[video.start.app]}${video.start.path}`)
        await page.waitForLoadState("networkidle")

        const recording = await startRecording(page, raw, frameSize(viewport ?? { width: 1440, height: 900 }, 2))
        const pacer = createPacer({
          page,
          device,
          app: video.start.app,
          baseUrl: (app) => urls[app],
          assetsDir: join(out, "assets"),
          downloadsDir: join(out, "downloads", base),
          zoom: flag("zoom"),
        })
        const captions: Caption[] = []
        const audio: AudioClip[] = []
        await sleep(STILL_MS)
        let lastAudioEndMs = 0
        for (const [i, step] of steps.entries()) {
          const startMs = recording.now()
          current = `step ${i + 1}/${steps.length} (${step.action}: ${step.caption_fr})`
          console.info(`${base} ${i + 1}/${steps.length} ${step.action}`)
          const line = lines[i]
          const narration = line ? clips.get(line) : undefined
          if (narration) {
            audio.push({ file: narration.file, atMs: startMs })
            lastAudioEndMs = startMs + narration.durationMs
          }
          await pacer.run(step, substitute(step.value))
          const spoken = narration ? narration.durationMs + 250 : 0
          const spokenRemainingMs = spoken - (recording.now() - startMs)
          expectedMs += Math.max(step.holdMs ?? DEFAULT_HOLD_MS, spoken)
          await sleep(
            stepHoldMs({
              holdMs: step.holdMs,
              defaultHoldMs: DEFAULT_HOLD_MS,
              spokenRemainingMs,
              last: i === steps.length - 1,
            }),
          )
          await pacer.zoomOut()
          captions.push({ startMs, endMs: recording.now(), text: step.caption_fr })
        }
        current = "closing the video"
        await sleep(tailWaitMs(recording.now(), lastAudioEndMs))
        await recording.stop()
        await context.close()

        const srt = join(out, "videos", `${base}.fr.srt`)
        written.push(srt)
        writeFileSync(srt, toSrt(captions))
        written.push(join(out, "videos", `${base}.fr.vtt`))
        writeFileSync(join(out, "videos", `${base}.fr.vtt`), toVtt(captions))
        if (steps.every((s) => s.caption_ar)) {
          const ar = steps.map((s, i) => ({ ...(captions[i] as Caption), text: s.caption_ar ?? "" }))
          written.push(join(out, "videos", `${base}.ar.srt`), join(out, "videos", `${base}.ar.vtt`))
          writeFileSync(join(out, "videos", `${base}.ar.srt`), toSrt(ar))
          writeFileSync(join(out, "videos", `${base}.ar.vtt`), toVtt(ar))
        }
        if (audio.length > 0 || flag("burn")) mux(raw, finalFile, audio, flag("burn") ? srt : undefined)
        else renameSync(raw, finalFile)
        const problem = durationProblem(probeDuration(finalFile), expectedMs)
        if (problem) throw new Error(`${base}: ${problem}`)
      }
      try {
        await withDeadline(record(), VIDEO_DEADLINE_MS, () => `${base} stuck at ${current}`)
      } catch (error) {
        for (const f of [...written, finalFile]) rmSync(f, { force: true })
        throw error
      } finally {
        rmSync(raw, { force: true })
        await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {})
        await context.close().catch(() => {})
      }
      produced.push(finalFile)
      console.info(`wrote ${finalFile}`)
    }
  }
  await browser.close()
  if (voice) console.info(`voice: ${voice}, ${clips.size} lines (cached and draft lines cost no credits)`)
  console.info(produced.join("\n"))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
