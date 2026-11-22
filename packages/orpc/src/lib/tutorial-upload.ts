import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  TUTORIAL_DEVICES,
  TUTORIAL_IDS,
  TUTORIAL_MANIFEST_KEY,
  type TutorialDevice,
  tutorialKeys,
} from "@workspace/sdk"
import { AwsClient } from "aws4fetch"

export type UploadEnv = "local" | "preview" | "production"

export const MAX_BYTES = { mp4: 300 * 1024 * 1024, vtt: 512 * 1024, jpg: 5 * 1024 * 1024 } as const
const CACHE = "public, max-age=86400"

export interface RemoteObject {
  size: number
  etag: string | null
}

/** What the uploader needs from a bucket: keys are already prefixed by the caller. */
export interface Bucket {
  head(key: string): Promise<RemoteObject | null>
  get(key: string): Promise<string | null>
  put(key: string, body: Uint8Array, headers: Record<string, string>): Promise<void>
}

export interface BucketConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/** Plain signed fetches against any S3 api (R2, Garage, minio), like the api's storage. */
export function createS3Bucket(config: BucketConfig): Bucket {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  })
  const url = (key: string) => `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${key}`
  return {
    async head(key) {
      const res = await aws.fetch(url(key), { method: "HEAD" })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`head ${key} failed (${res.status})`)
      return {
        size: Number(res.headers.get("content-length")),
        etag: res.headers.get("etag")?.replace(/"/g, "") ?? null,
      }
    },
    async get(key) {
      const res = await aws.fetch(url(key))
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`get ${key} failed (${res.status})`)
      return res.text()
    },
    async put(key, body, headers) {
      for (let attempt = 1; ; attempt++) {
        const res = await aws.fetch(url(key), { method: "PUT", body: Buffer.from(body), headers })
        if (res.ok) return
        if (res.status < 500 || attempt === 3) throw new Error(`put ${key} failed (${res.status})`)
        await new Promise((r) => setTimeout(r, 500 * attempt))
      }
    },
  }
}

export interface LocalFile {
  path: string
  key: string
  size: number
  type: string
}

export interface LocalVideo {
  id: string
  poster: LocalFile | null
  devices: Partial<Record<TutorialDevice, { video: LocalFile | null; captions: LocalFile | null }>>
}

export interface ScanResult {
  videos: LocalVideo[]
  /** Files that match nothing in the catalogue or fail a sanity check, with the reason. */
  rejected: string[]
}

const FILE = /^(.+?)(?:-(desktop|mobile))?\.(mp4|vtt|jpg)$/

function checkFile(path: string, ext: "mp4" | "vtt" | "jpg", size: number): string | null {
  if (size === 0) return "empty file"
  if (size > MAX_BYTES[ext]) return `larger than the ${Math.round(MAX_BYTES[ext] / 1024 / 1024)} MB limit`
  const head = readFileSync(path).subarray(0, 12)
  if (ext === "mp4" && head.subarray(4, 8).toString("latin1") !== "ftyp") return "not an mp4 (no ftyp box)"
  if (ext === "vtt" && !head.toString("utf8").replace(/^﻿/, "").startsWith("WEBVTT"))
    return "not WebVTT (no WEBVTT header)"
  if (ext === "jpg" && !(head[0] === 0xff && head[1] === 0xd8)) return "not a jpeg"
  return null
}

/** Reads `<id>-<device>.mp4|.vtt` and `<id>.jpg` from a folder and checks size limits and magic bytes. */
export function scanTutorialFolder(dir: string): ScanResult {
  const byId = new Map<string, LocalVideo>()
  const rejected: string[] = []
  for (const name of readdirSync(dir).sort()) {
    const m = FILE.exec(name)
    if (!m) continue
    const id = m[1] ?? ""
    const device = m[2] as TutorialDevice | undefined
    const ext = m[3] as "mp4" | "vtt" | "jpg"
    if (!TUTORIAL_IDS.has(id)) {
      rejected.push(`${name}: unknown id`)
      continue
    }
    if ((ext === "jpg") === (device !== undefined)) {
      rejected.push(`${name}: expected <id>-<desktop|mobile>.mp4|vtt or <id>.jpg`)
      continue
    }
    const path = join(dir, name)
    const size = statSync(path).size
    const problem = checkFile(path, ext, size)
    if (problem) {
      rejected.push(`${name}: ${problem}`)
      continue
    }
    const video = byId.get(id) ?? { id, poster: null, devices: {} }
    byId.set(id, video)
    if (!device) {
      video.poster = { path, key: tutorialKeys(id, "desktop").poster, size, type: "image/jpeg" }
      continue
    }
    const keys = tutorialKeys(id, device)
    const entry = video.devices[device] ?? { video: null, captions: null }
    if (ext === "mp4") entry.video = { path, key: keys.video, size, type: "video/mp4" }
    else entry.captions = { path, key: keys.captions, size, type: "text/vtt" }
    video.devices[device] = entry
  }
  return { videos: [...byId.values()], rejected }
}

export interface CompleteVideo {
  id: string
  files: LocalFile[]
  desktop: boolean
  mobile: boolean
  bytes: Partial<Record<TutorialDevice, number>>
  mp4: Partial<Record<TutorialDevice, string>>
}

/**
 * A video is complete with a poster and at least one device that has both its mp4 and its captions. A device with
 * only one of the two is left out; a video without any ready device is reported and never uploaded or listed.
 */
export function splitComplete(videos: LocalVideo[]): { complete: CompleteVideo[]; incomplete: string[] } {
  const complete: CompleteVideo[] = []
  const incomplete: string[] = []
  for (const v of videos) {
    const missing: string[] = v.poster ? [] : ["poster"]
    const files: LocalFile[] = v.poster ? [v.poster] : []
    const done: CompleteVideo = { id: v.id, files, desktop: false, mobile: false, bytes: {}, mp4: {} }
    for (const d of TUTORIAL_DEVICES) {
      const e = v.devices[d]
      if (!e) continue
      if (!e.video) missing.push(`${d} mp4`)
      if (!e.captions) missing.push(`${d} vtt`)
      if (!e.video || !e.captions) continue
      files.push(e.video, e.captions)
      done[d] = true
      done.bytes[d] = e.video.size
      done.mp4[d] = e.video.path
    }
    if (!v.poster || (!done.desktop && !done.mobile)) {
      incomplete.push(`${v.id}: missing ${missing.join(", ") || "any device"}`)
      continue
    }
    complete.push(done)
  }
  return { complete, incomplete }
}

export interface UploadOptions {
  bucket: Bucket
  /** Environment prefix of the api (`pr-<n>/`, `staging/` or empty). */
  prefix: string
  dir: string
  dryRun?: boolean
  /** Seconds of a local mp4, when ffprobe is around. */
  probeSeconds?: (path: string) => number | null
  log?: (line: string) => void
  now?: () => Date
}

export interface UploadReport {
  uploaded: string[]
  skipped: string[]
  incomplete: string[]
  rejected: string[]
  /** Manifest entries added or changed by this run. */
  listed: string[]
  manifestWritten: boolean
}

/** Same size, and the same md5 when the remote etag is one (multipart etags contain a dash and only compare by size). */
function identical(file: LocalFile, remote: RemoteObject | null): boolean {
  if (!remote || remote.size !== file.size) return false
  if (!remote.etag || remote.etag.includes("-")) return true
  return remote.etag === createHash("md5").update(readFileSync(file.path)).digest("hex")
}

function remoteVideos(text: string | null): Record<string, unknown> {
  try {
    const json = text ? JSON.parse(text) : null
    const videos = json?.videos
    return videos && typeof videos === "object" && !Array.isArray(videos) ? videos : {}
  } catch {
    return {}
  }
}

/**
 * Uploads every complete set, then writes the manifest last, so the page never points at a missing file. Safe to rerun:
 * identical objects are skipped, so an interrupted run resumes where it stopped. Videos already in the remote manifest
 * stay listed.
 */
export async function uploadTutorials(opts: UploadOptions): Promise<UploadReport> {
  const { bucket, prefix, dryRun = false } = opts
  const log = opts.log ?? (() => {})
  const { videos, rejected } = scanTutorialFolder(opts.dir)
  const { complete, incomplete } = splitComplete(videos)
  const report: UploadReport = { uploaded: [], skipped: [], incomplete, rejected, listed: [], manifestWritten: false }

  for (const video of complete) {
    for (const file of video.files) {
      if (identical(file, await bucket.head(`${prefix}${file.key}`))) {
        report.skipped.push(file.key)
        log(`skip ${file.key}`)
        continue
      }
      log(`${dryRun ? "would upload" : "upload"} ${file.key} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
      if (!dryRun)
        await bucket.put(`${prefix}${file.key}`, readFileSync(file.path), {
          "content-type": file.type,
          "cache-control": CACHE,
        })
      report.uploaded.push(file.key)
    }
  }

  const manifestKey = `${prefix}${TUTORIAL_MANIFEST_KEY}`
  const before = remoteVideos(await bucket.get(manifestKey))
  const after: Record<string, unknown> = { ...before }
  for (const v of complete) {
    const seconds: Partial<Record<TutorialDevice, number>> = {}
    for (const d of TUTORIAL_DEVICES) {
      const path = v.mp4[d]
      const s = path ? opts.probeSeconds?.(path) : null
      if (s) seconds[d] = Math.round(s)
    }
    after[v.id] = {
      desktop: v.desktop,
      mobile: v.mobile,
      captions: true,
      poster: true,
      bytes: v.bytes,
      ...(Object.keys(seconds).length ? { seconds } : {}),
    }
  }
  const sorted = Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b)))
  report.listed = Object.keys(sorted).filter((id) => JSON.stringify(sorted[id]) !== JSON.stringify(before[id]))
  if (report.listed.length === 0) {
    log("manifest unchanged")
    return report
  }
  log(`${dryRun ? "would write" : "write"} ${TUTORIAL_MANIFEST_KEY} (${report.listed.length} changed)`)
  if (dryRun) return report
  const body = JSON.stringify({ updatedAt: (opts.now?.() ?? new Date()).toISOString(), videos: sorted }, null, 2)
  await bucket.put(manifestKey, new TextEncoder().encode(`${body}\n`), {
    "content-type": "application/json",
    "cache-control": "public, max-age=300",
  })
  report.manifestWritten = true
  return report
}

export interface TargetEnv {
  APP_ENV?: string
  DEPLOY_ENV?: string
  S3_ENDPOINT?: string
  S3_BUCKET?: string
  S3_REGION?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
}

export interface Target {
  env: UploadEnv
  prefix: string
  config: BucketConfig
}

/**
 * Reads the bucket the way the api does and refuses anything ambiguous. Production needs `--env production --confirm`
 * and every signal (APP_ENV, DEPLOY_ENV, bucket, endpoint) must agree; any other run must not look like production.
 */
export function resolveTarget(env: TargetEnv, flags: { env?: string; confirm?: boolean }): Target {
  const appEnv = env.APP_ENV || "local"
  if (appEnv !== "local" && appEnv !== "preview" && appEnv !== "production")
    throw new Error(`APP_ENV=${appEnv} is not local, preview or production`)
  if (flags.env && flags.env !== appEnv) throw new Error(`--env ${flags.env} does not match APP_ENV=${appEnv}`)
  const { S3_ENDPOINT: endpoint, S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secret } = env
  if (!endpoint || !bucket || !accessKeyId || !secret)
    throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required")
  const deploy = env.DEPLOY_ENV || "local"
  const looksProd = /r2\.cloudflarestorage\.com/.test(endpoint) || bucket === "ceraghit-prod"
  if (appEnv === "production") {
    if (!(flags.env === "production" && flags.confirm)) throw new Error("production needs --env production --confirm")
    if (deploy !== "production") throw new Error("production needs DEPLOY_ENV=production")
    if (bucket === "ceraghit-dev" || bucket.startsWith("ceraghit-e2e"))
      throw new Error(`bucket ${bucket} is not a production bucket`)
  } else {
    if (looksProd) throw new Error(`bucket ${bucket} looks like production but APP_ENV=${appEnv}`)
    if (deploy === "production") throw new Error("DEPLOY_ENV=production is only allowed with APP_ENV=production")
  }
  return {
    env: appEnv,
    prefix: deploy.startsWith("pr-") || deploy === "staging" ? `${deploy}/` : "",
    config: { endpoint, bucket, region: env.S3_REGION || "auto", accessKeyId, secretAccessKey: secret },
  }
}
