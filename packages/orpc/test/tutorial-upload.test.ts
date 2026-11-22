import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Bucket, resolveTarget, uploadTutorials } from "../src/lib/tutorial-upload"

const ID = "07-rechercher-produit"
const OTHER = "08-trier-produits"
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)])
const VTT = Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n")
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

/** Garage/minio-like: etag is the md5 of the body, objects keep their headers, a put can be made to fail. */
function fakeBucket() {
  const objects = new Map<string, { body: Buffer; headers: Record<string, string> }>()
  const puts: string[] = []
  let failOn: string | null = null
  const bucket: Bucket = {
    head: async (key) => {
      const o = objects.get(key)
      return o ? { size: o.body.length, etag: createHash("md5").update(o.body).digest("hex") } : null
    },
    get: async (key) => objects.get(key)?.body.toString() ?? null,
    put: async (key, body, headers) => {
      if (key === failOn) throw new Error("boom")
      puts.push(key)
      objects.set(key, { body: Buffer.from(body), headers })
    },
  }
  return {
    bucket,
    objects,
    puts,
    failOn: (key: string | null) => {
      failOn = key
    },
    manifest: () => JSON.parse(objects.get("tutorials/manifest.json")?.body.toString() ?? "null"),
  }
}

let dir: string
const write = (name: string, body: Buffer) => writeFileSync(join(dir, name), body)
const fullSet = () => {
  for (const d of ["desktop", "mobile"]) {
    write(`${ID}-${d}.mp4`, MP4)
    write(`${ID}-${d}.vtt`, VTT)
  }
  write(`${ID}.jpg`, JPG)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tutorials-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("uploadTutorials", () => {
  test("uploads a complete set under the prefix with content types and writes the manifest last", async () => {
    fullSet()
    const s3 = fakeBucket()
    const report = await uploadTutorials({
      bucket: s3.bucket,
      prefix: "pr-9/",
      dir,
      probeSeconds: () => 12.4,
      now: () => new Date("2026-01-01T00:00:00Z"),
    })
    expect(s3.puts.at(-1)).toBe("pr-9/tutorials/manifest.json")
    expect(s3.puts).toHaveLength(6)
    expect(s3.objects.get(`pr-9/tutorials/${ID}-desktop.mp4`)?.headers["content-type"]).toBe("video/mp4")
    expect(s3.objects.get(`pr-9/tutorials/${ID}-mobile.vtt`)?.headers["content-type"]).toBe("text/vtt")
    expect(s3.objects.get(`pr-9/tutorials/${ID}.jpg`)?.headers["content-type"]).toBe("image/jpeg")
    expect(s3.objects.get(`pr-9/tutorials/${ID}.jpg`)?.headers["cache-control"]).toContain("max-age")
    const manifest = JSON.parse(s3.objects.get("pr-9/tutorials/manifest.json")?.body.toString() ?? "")
    expect(manifest.videos[ID]).toMatchObject({
      desktop: true,
      mobile: true,
      captions: true,
      poster: true,
      seconds: { desktop: 12, mobile: 12 },
    })
    expect(report.manifestWritten).toBe(true)
  })

  test("an interrupted run leaves no manifest and resumes; a second run changes nothing", async () => {
    fullSet()
    const s3 = fakeBucket()
    s3.failOn(`tutorials/${ID}-mobile.mp4`)
    await expect(uploadTutorials({ bucket: s3.bucket, prefix: "", dir })).rejects.toThrow("boom")
    expect(s3.objects.has("tutorials/manifest.json")).toBe(false)

    s3.failOn(null)
    s3.puts.length = 0
    const resumed = await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(resumed.skipped).toContain(`tutorials/${ID}-desktop.mp4`)
    expect(s3.puts).not.toContain(`tutorials/${ID}-desktop.mp4`)
    expect(s3.puts.at(-1)).toBe("tutorials/manifest.json")

    s3.puts.length = 0
    const again = await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(s3.puts).toEqual([])
    expect(again.manifestWritten).toBe(false)
  })

  test("a changed file with the same size is re-uploaded because the etag differs", async () => {
    fullSet()
    const s3 = fakeBucket()
    await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    write(`${ID}-desktop.vtt`, Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nBonsoir\n"))
    const report = await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(report.uploaded).toEqual([`tutorials/${ID}-desktop.vtt`])
  })

  test("incomplete sets and junk are reported and never uploaded or listed, a ready device of a half set is", async () => {
    write(`${OTHER}-desktop.mp4`, MP4)
    write("junk-desktop.mp4", MP4)
    write(`${ID}-mobile.mp4`, Buffer.from("not an mp4 at all, long enough"))
    write(`${ID}-desktop.mp4`, MP4)
    write(`${ID}-desktop.vtt`, VTT)
    write(`${ID}.jpg`, JPG)
    const s3 = fakeBucket()
    const report = await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(report.rejected.join("\n")).toContain("junk-desktop.mp4: unknown id")
    expect(report.rejected.join("\n")).toContain(`${ID}-mobile.mp4: not an mp4`)
    expect(report.incomplete.join("\n")).toContain(OTHER)
    expect(s3.manifest().videos[ID]).toMatchObject({ desktop: true, mobile: false })
    expect(Object.keys(s3.manifest().videos)).toEqual([ID])
    expect([...s3.objects.keys()].some((k) => k.includes(OTHER))).toBe(false)
  })

  test("videos already in the remote manifest stay listed, and a dry run writes nothing", async () => {
    fullSet()
    const s3 = fakeBucket()
    s3.objects.set("tutorials/manifest.json", {
      body: Buffer.from(JSON.stringify({ videos: { "01-decouvrir-accueil": { desktop: true } } })),
      headers: {},
    })
    const dry = await uploadTutorials({ bucket: s3.bucket, prefix: "", dir, dryRun: true })
    expect(s3.puts).toEqual([])
    expect(dry.uploaded).toHaveLength(5)
    await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(Object.keys(s3.manifest().videos)).toEqual(["01-decouvrir-accueil", ID])
  })
})

describe("resolveTarget", () => {
  const base = {
    S3_ENDPOINT: "http://localhost:9100",
    S3_BUCKET: "ceraghit-dev",
    S3_ACCESS_KEY_ID: "a",
    S3_SECRET_ACCESS_KEY: "b",
  }
  const prod = {
    ...base,
    APP_ENV: "production",
    DEPLOY_ENV: "production",
    S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
    S3_BUCKET: "ceraghit-prod",
  }
  const confirmed = { env: "production", confirm: true }

  test("local and preview resolve the api prefix", () => {
    expect(resolveTarget({ ...base, APP_ENV: "preview", DEPLOY_ENV: "pr-12" }, {}).prefix).toBe("pr-12/")
    expect(resolveTarget(base, {}).prefix).toBe("")
  })

  test("production needs --env production and --confirm together", () => {
    expect(() => resolveTarget(prod, {})).toThrow("--confirm")
    expect(() => resolveTarget(prod, { env: "production" })).toThrow("--confirm")
    expect(resolveTarget(prod, confirmed).env).toBe("production")
  })

  test("production is an allowlist: DEPLOY_ENV, R2 host and the exact bucket", () => {
    expect(() => resolveTarget({ ...prod, DEPLOY_ENV: "local" }, confirmed)).toThrow("DEPLOY_ENV=production")
    expect(() => resolveTarget({ ...prod, DEPLOY_ENV: undefined }, confirmed)).toThrow("DEPLOY_ENV=production")
    const refused: [string, string][] = [
      ["https://garage.homelab", "ceraghit-x"],
      ["http://localhost:9301", "ceraghit-prev"],
      ["https://acc.r2.cloudflarestorage.com", "ceraghit-staging"],
      ["https://acc.eu.r2.cloudflarestorage.com", "ceraghit-dev2"],
      ["https://acc.r2.cloudflarestorage.com", "ceraghit-prod-copy"],
      ["https://cdn.ceraghit.com", "ceraghit-prod"],
    ]
    for (const [S3_ENDPOINT, S3_BUCKET] of refused)
      expect(() => resolveTarget({ ...prod, S3_ENDPOINT, S3_BUCKET }, confirmed)).toThrow()
    expect(
      resolveTarget({ ...prod, S3_BUCKET: "ceraghit-other", TUTORIALS_PROD_BUCKET: "ceraghit-other" }, confirmed).env,
    ).toBe("production")
  })

  test("a non-production run refuses anything that looks like production", () => {
    for (const [S3_ENDPOINT, S3_BUCKET] of [
      ["http://localhost:9301", "ceraghit-prod"],
      ["http://localhost:9301", "ceraghit-prod-copy"],
      ["https://acc.r2.cloudflarestorage.com", "ceraghit-dev"],
      ["https://cdn.ceraghit.com", "ceraghit-prod-copy"],
      ["https://acc.r2.cloudflarestorage.com.", "ceraghit-dev"],
      ["https://cdn.ceraghit.com.", "ceraghit-dev"],
    ])
      expect(() => resolveTarget({ ...base, APP_ENV: "preview", S3_ENDPOINT, S3_BUCKET }, {})).toThrow(
        "looks like production",
      )
  })

  test("environments never mix", () => {
    expect(() => resolveTarget(base, confirmed)).toThrow("does not match")
    expect(() => resolveTarget({ ...base, DEPLOY_ENV: "production" }, {})).toThrow("DEPLOY_ENV=production")
    expect(() => resolveTarget({ ...prod, S3_SECRET_ACCESS_KEY: undefined }, confirmed)).toThrow("required")
  })
})

describe("file sanity limits", () => {
  const rejectedOf = async (name: string) =>
    (await uploadTutorials({ bucket: fakeBucket().bucket, prefix: "", dir, dryRun: true })).rejected
      .join("\n")
      .includes(name)

  test("empty files are rejected", async () => {
    write(`${ID}.jpg`, Buffer.alloc(0))
    expect(await rejectedOf(`${ID}.jpg: empty file`)).toBe(true)
  })

  test("files over 300 MB (mp4), 512 KB (vtt) and 5 MB (jpg) are rejected, at the limit they pass", async () => {
    write(`${ID}-desktop.mp4`, MP4)
    truncateSync(join(dir, `${ID}-desktop.mp4`), 300 * 1024 * 1024 + 1)
    write(`${ID}-desktop.vtt`, VTT)
    truncateSync(join(dir, `${ID}-desktop.vtt`), 512 * 1024 + 1)
    write(`${ID}.jpg`, JPG)
    truncateSync(join(dir, `${ID}.jpg`), 5 * 1024 * 1024 + 1)
    const report = await uploadTutorials({ bucket: fakeBucket().bucket, prefix: "", dir, dryRun: true })
    expect(report.rejected).toHaveLength(3)
    truncateSync(join(dir, `${ID}.jpg`), 5 * 1024 * 1024)
    truncateSync(join(dir, `${ID}-desktop.vtt`), 512 * 1024)
    const ok = await uploadTutorials({ bucket: fakeBucket().bucket, prefix: "", dir, dryRun: true })
    expect(ok.rejected).toHaveLength(1)
  })
})

describe("manifest safety", () => {
  test("an unreadable remote manifest aborts before any upload unless --reset-manifest", async () => {
    fullSet()
    const s3 = fakeBucket()
    s3.objects.set("tutorials/manifest.json", { body: Buffer.from("{not json"), headers: {} })
    await expect(uploadTutorials({ bucket: s3.bucket, prefix: "", dir })).rejects.toThrow("--reset-manifest")
    expect(s3.puts).toEqual([])
    await uploadTutorials({ bucket: s3.bucket, prefix: "", dir, resetManifest: true })
    expect(s3.manifest().videos[ID]).toMatchObject({ desktop: true })
  })

  test("a desktop-only folder keeps the mobile flag already listed", async () => {
    write(`${ID}-desktop.mp4`, MP4)
    write(`${ID}-desktop.vtt`, VTT)
    write(`${ID}.jpg`, JPG)
    const s3 = fakeBucket()
    s3.objects.set("tutorials/manifest.json", {
      body: Buffer.from(JSON.stringify({ videos: { [ID]: { desktop: true, mobile: true, bytes: { mobile: 9 } } } })),
      headers: {},
    })
    await uploadTutorials({ bucket: s3.bucket, prefix: "", dir })
    expect(s3.manifest().videos[ID]).toMatchObject({ desktop: true, mobile: true, bytes: { mobile: 9 } })
  })
})
