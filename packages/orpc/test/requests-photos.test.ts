import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createDb, customRequests, uploads } from "@workspace/db"
import { runMigrations } from "@workspace/db/migrate"
import { REQUEST_IMAGE_MAX_BYTES } from "@workspace/sdk"
import { eq, like } from "drizzle-orm"
import { type Context, createContext, type Services } from "../src/context"
import { AdminAuth } from "../src/lib/auth"
import { ConsoleMailer } from "../src/lib/mailer"
import { DemoProvider } from "../src/lib/payments"
import { type Storage, TOO_LARGE } from "../src/lib/storage"
import { appRouter } from "../src/routers"

const url = process.env.DATABASE_URL
const text = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]

/** A header-correct lossless WebP of the given size. */
function webp(width: number, height: number): Uint8Array {
  const data = [0x2f, ...u32((width - 1) | ((height - 1) << 14)), ...new Array(24).fill(7)]
  const body = [...text("WEBP"), ...text("VP8L"), ...u32(data.length), ...data]
  return Uint8Array.from([...text("RIFF"), ...u32(body.length), ...body])
}
const PNG = Uint8Array.from([0x89, ...text("PNG"), 13, 10, 26, 10, ...new Array(40).fill(0)])

describe.skipIf(!url)("request photos", () => {
  const db = createDb(url!)
  const tag = `photos-${Date.now()}`
  const prefix = `pr-${tag}/`
  const objects = new Map<string, Uint8Array>()
  const storage: Storage = {
    bucket: "b",
    prefix,
    presignPut: async (key) => `https://s3.test/${key}`,
    put: async () => {},
    signedGet: async (key) => key,
    head: async (key) => objects.has(key),
    read: async (key, max) => {
      const bytes = objects.get(key)
      if (bytes && bytes.length > max) throw new Error(TOO_LARGE)
      return bytes ?? null
    },
    readUrl: async (key) => key,
    publicUrl: () => null,
    remove: async (key) => void objects.delete(key),
    list: async () => [],
  }
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
  let visitors = 0
  const client = () =>
    createRouterClient(appRouter, {
      context: (): Context => createContext(services, new Headers({ "x-forwarded-for": `${tag}-${visitors++}` })),
    })
  const request = {
    name: `Photo ${tag}`,
    email: "photos@example.com",
    description: "Un vase aux motifs",
    locale: "fr" as const,
  }
  /** What the storefront does: sign, then PUT the bytes. */
  async function upload(bytes: Uint8Array, signedSize = bytes.length) {
    const { image } = await client().public.requests.uploadUrl({ contentType: "image/webp", size: signedSize })
    objects.set(image.slice(3), bytes)
    return image
  }

  beforeAll(() => runMigrations(db))
  afterAll(async () => {
    await db.delete(customRequests).where(eq(customRequests.name, request.name))
    await db.delete(uploads).where(like(uploads.key, `${prefix}%`))
  })

  test("only WebP can be signed", async () => {
    await expect(
      client().public.requests.uploadUrl({ contentType: "image/jpeg" as "image/webp", size: 1000 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a request keeps a valid WebP and rejects a missing, foreign, PNG, oversized or too large photo", async () => {
    const good = await upload(webp(1200, 800))
    await client().public.requests.create({ ...request, images: [good] })
    const [saved] = await db.select().from(customRequests).where(eq(customRequests.name, request.name))
    expect(saved?.images).toEqual([good])

    const reject = (images: string[]) => client().public.requests.create({ ...request, images })
    await expect(reject([`s3:${prefix}requests/never-uploaded.webp`])).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(reject(["s3:other/requests/a.webp"])).rejects.toMatchObject({ code: "BAD_REQUEST" })

    for (const bytes of [PNG, webp(3000, 2000), new Uint8Array(REQUEST_IMAGE_MAX_BYTES + 1)]) {
      const image = await upload(bytes, Math.min(bytes.length, 1000))
      await expect(reject([image])).rejects.toMatchObject({ data: { reason: "photo_unreadable" } })
      expect(objects.has(image.slice(3))).toBe(false)
      expect(
        await db
          .select()
          .from(uploads)
          .where(eq(uploads.key, image.slice(3))),
      ).toHaveLength(0)
    }
  })
})
