import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createRouterClient } from "@orpc/server"
import { createDb, media, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { seed } from "@workspace/db/seed"
import { MEDIA_MAX_BYTES } from "@workspace/sdk"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import type { Storage } from "../src/lib/storage"
import { adminRouter } from "../src/routers/admin"

const url = process.env.DATABASE_URL
const text = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]

/** A header-correct lossless WebP; the pixel data is random so every call has its own hash. */
function webp(width: number, height: number): Uint8Array {
  const data = [0x2f, ...u32((width - 1) | ((height - 1) << 14)), ...crypto.getRandomValues(new Uint8Array(24))]
  const body = [...text("WEBP"), ...text("VP8L"), ...u32(data.length), ...data]
  return Uint8Array.from([...text("RIFF"), ...u32(body.length), ...body])
}
const makeOwner = (context: () => Context) => createRouterClient(adminRouter, { context })
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")

describe.skipIf(!url)("media upload", () => {
  const db = createDb(url!)
  const objects = new Map<string, Uint8Array>()
  const prefix = `pr-${crypto.randomUUID().slice(0, 8)}/`
  const storage: Storage = {
    bucket: "b",
    prefix,
    presignPut: async (key) => `https://s3.test/${key}`,
    head: async (key) => objects.has(key),
    read: async (key) => objects.get(key) ?? null,
    readUrl: async (key) => key,
    publicUrl: () => null,
    remove: async (key) => void objects.delete(key),
    list: async () => [],
  }
  let owner: ReturnType<typeof makeOwner>
  const input = (bytes: Uint8Array, over = {}) => ({
    originalName: "Vase noir.JPG",
    contentType: "image/webp" as const,
    size: bytes.length,
    width: 800,
    height: 600,
    hash: sha(bytes),
    ...over,
  })
  /** What the browser does: sign, PUT the bytes to the bucket. */
  async function upload(bytes: Uint8Array, over = {}) {
    const signed = await owner.media.sign(input(bytes, over))
    if (signed.status !== "upload") throw new Error("expected an upload")
    objects.set(new URL(signed.uploadUrl).pathname.slice(1), bytes)
    return signed.mediaId
  }
  const rows = () =>
    db
      .select()
      .from(media)
      .where(like(media.key, `${prefix}%`))
  const quota = () =>
    db
      .select()
      .from(uploads)
      .where(like(uploads.key, `${prefix}%`))

  beforeAll(async () => {
    await runMigrations(db)
    await seed(db, { admin: { email: "owner@test.local", password: "clay-test-pass" } })
    const services: Services = {
      db,
      payments: new DemoProvider("https://web.test"),
      mailer: new ConsoleMailer(),
      storage,
      auth: new AdminAuth(db),
      now: () => new Date(),
      config: {
        webUrl: "https://web.test",
        apiPublicUrl: "https://api.test",
        appEnv: "local",
        deployEnv: "test",
        secureCookies: false,
        onlinePayments: true,
      },
    }
    const session = await services.auth.login("127.0.0.1", "owner@test.local", "clay-test-pass")
    const headers = () =>
      new Headers({
        cookie: `ceraghit_admin=${session!.token}`,
        "x-csrf-token": "orpc",
        "x-forwarded-for": `media-${prefix}`,
      })
    owner = makeOwner(() => createContext(services, headers()))
  })

  afterAll(async () => {
    for (const r of await rows()) await db.delete(media).where(eq(media.id, r.id))
    for (const r of await quota()) await db.delete(uploads).where(eq(uploads.key, r.key))
  })

  test("a valid WebP is confirmed under a readable random key", async () => {
    const bytes = webp(800, 600)
    const confirmed = await owner.media.confirm({ id: await upload(bytes) })
    expect(confirmed.key).toMatch(new RegExp(`^${prefix}media/vase-noir-[a-z0-9]{6}\\.webp$`))
    expect(confirmed).toMatchObject({ filename: "vase-noir.webp", width: 800, height: 600, bytes: bytes.length })
  })

  test("the same bytes signed twice give the first media and no second object", async () => {
    const bytes = webp(800, 600)
    const first = await owner.media.confirm({ id: await upload(bytes) })
    const again = await owner.media.sign(input(bytes, { originalName: "autre.webp" }))
    expect(again).toMatchObject({ status: "existing", media: { id: first.id } })
    expect((await rows()).filter((r) => r.hash === sha(bytes))).toHaveLength(1)
  })

  test("a PNG sent as a WebP is refused, its object and rows removed", async () => {
    const png = Uint8Array.from([0x89, ...text("PNG"), 13, 10, 26, 10, ...crypto.getRandomValues(new Uint8Array(60))])
    const id = await upload(png)
    await expect(owner.media.confirm({ id })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect((await rows()).find((r) => r.id === id)).toBeUndefined()
    expect((await quota()).length).toBe((await rows()).length)
    expect(objects.size).toBe((await rows()).length)
  })

  test("a header that says 4000px, or sizes different from the signed ones, is refused", async () => {
    const huge = webp(4000, 600)
    await expect(owner.media.confirm({ id: await upload(huge) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const lie = webp(900, 600)
    await expect(owner.media.confirm({ id: await upload(lie) })).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("bytes that are not the signed hash are refused", async () => {
    const signedFor = webp(800, 600)
    const signed = await owner.media.sign(input(signedFor))
    if (signed.status !== "upload") throw new Error("expected an upload")
    const other = webp(800, 600)
    objects.set(new URL(signed.uploadUrl).pathname.slice(1), other)
    await expect(owner.media.confirm({ id: signed.mediaId })).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("sign refuses another content type and an oversize file", async () => {
    const bytes = webp(800, 600)
    await expect(owner.media.sign(input(bytes, { contentType: "image/png" }))).rejects.toThrow()
    await expect(owner.media.sign(input(bytes, { size: MEDIA_MAX_BYTES + 1 }))).rejects.toThrow()
    await expect(owner.media.sign(input(bytes, { width: 100 }))).rejects.toThrow()
  })
})
