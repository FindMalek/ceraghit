import { type ChildProcessByStdio, spawn, spawnSync } from "node:child_process"
import type { Readable, Writable } from "node:stream"
import type { CDPSession, Page } from "@playwright/test"

export const FPS = 30

export const FFMPEG = process.env.FFMPEG || "ffmpeg"

export interface Recording {
  /** Milliseconds since the recording started. */
  now(): number
  stop(): Promise<void>
}

/** The even pixel size of the video: the viewport times the device scale factor. */
export function frameSize(
  viewport: { width: number; height: number },
  scale: number,
): { width: number; height: number } {
  const even = (n: number) => Math.round(n * scale) - (Math.round(n * scale) % 2)
  return { width: even(viewport.width), height: even(viewport.height) }
}

/**
 * Chromium screencast, frames piped to ffmpeg at a constant 30 fps. The screencast only sends a frame when the page
 * changes, so each frame is repeated for as long as it was on screen, by its own timestamp.
 */
export async function startRecording(
  page: Page,
  outFile: string,
  size: { width: number; height: number },
): Promise<Recording> {
  const client: CDPSession = await page.context().newCDPSession(page)
  const ffmpeg: ChildProcessByStdio<Writable, null, Readable> = spawn(
    FFMPEG,
    [
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-vcodec",
      "mjpeg",
      "-i",
      "-",
      "-vf",
      `scale=${size.width}:${size.height}:flags=lanczos`,
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-movflags",
      "+faststart",
      outFile,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  )
  let stderr = ""
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000)
  })
  const closed = new Promise<number>((resolve) => {
    ffmpeg.on("close", (code) => resolve(code ?? 1))
    ffmpeg.on("error", (error) => {
      stderr += String(error)
      resolve(1)
    })
  })
  ffmpeg.stdin.on("error", () => {})
  let dead = false
  void closed.then(() => {
    dead = true
  })

  let previous: Buffer | null = null
  let previousAt = 0
  const startedAt = Date.now()
  let queue: Promise<void> = Promise.resolve()
  const write = (frame: Buffer, copies: number) => {
    queue = queue.then(async () => {
      for (let i = 0; i < copies && !dead; i++) {
        if (!ffmpeg.stdin.write(frame))
          await Promise.race([new Promise<void>((resolve) => ffmpeg.stdin.once("drain", () => resolve())), closed])
      }
    })
  }

  client.on("Page.screencastFrame", (event) => {
    const at = (event.metadata.timestamp ?? Date.now() / 1000) * 1000
    const pending = previous
    const pendingAt = previousAt
    previous = Buffer.from(event.data, "base64")
    previousAt = at
    client.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {})
    if (pending) write(pending, Math.max(1, Math.round(((at - pendingAt) / 1000) * FPS)))
  })
  // The screencast sends nothing while the page is still, so without a first frame the video would start at the first
  // change and every later cue would sit ahead of the picture.
  const initial = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 90 })
  previous = Buffer.from(initial.data, "base64")
  previousAt = startedAt
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: size.width,
    maxHeight: size.height,
    everyNthFrame: 2,
  })

  return {
    now: () => Date.now() - startedAt,
    async stop() {
      await client.send("Page.stopScreencast").catch(() => {})
      if (previous) write(previous, Math.max(1, Math.round(((Date.now() - previousAt) / 1000) * FPS)))
      await queue
      ffmpeg.stdin.end()
      const code = await closed
      if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${stderr}`)
    },
  }
}

export interface AudioClip {
  file: string
  atMs: number
}

/** Adds the narration clips at their start times and, with `burnFile`, the captions into the picture. */
export function mux(input: string, output: string, clips: AudioClip[], burnFile?: string): void {
  const args = ["-y", "-i", input]
  for (const clip of clips) args.push("-i", clip.file)
  const filters: string[] = []
  for (const [i, clip] of clips.entries()) filters.push(`[${i + 1}:a]adelay=${clip.atMs}|${clip.atMs}[a${i}]`)
  if (clips.length > 0) {
    filters.push(`${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0[aout]`)
  }
  if (burnFile) filters.push(`[0:v]subtitles=${burnFile.replace(/[:\\']/g, "\\$&")}[vout]`)
  if (filters.length > 0) args.push("-filter_complex", filters.join(";"))
  args.push("-map", burnFile ? "[vout]" : "0:v")
  if (clips.length > 0) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k")
  args.push("-c:v", burnFile ? "libx264" : "copy")
  if (burnFile) args.push("-crf", "18", "-pix_fmt", "yuv420p")
  args.push("-movflags", "+faststart", output)
  const res = spawnSync(FFMPEG, args, { encoding: "utf8" })
  if (res.status !== 0) throw new Error(`ffmpeg mux failed: ${res.stderr.slice(-1500)}`)
}
