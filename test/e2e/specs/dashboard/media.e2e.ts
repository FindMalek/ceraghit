import { createHash } from "node:crypto"
import type { Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { markMediaUnused, mediaById, mediaRows, pinMedia } from "../../support/media"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

const ADMIN = { "x-csrf-token": "orpc" }

/** A picture drawn by the browser itself, so no binary file lives in the repo. */
async function drawn(page: Page, type: "image/png" | "image/webp", width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ type, width, height }) => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      const tint = () => Math.floor(Math.random() * 256)
      gradient.addColorStop(0, `rgb(${tint()}, ${tint()}, ${tint()})`)
      gradient.addColorStop(1, `rgb(${tint()}, ${tint()}, ${tint()})`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), type, 0.8))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ""
      for (const b of bytes) binary += String.fromCharCode(b)
      return btoa(binary)
    },
    { type, width, height },
  )
  return Buffer.from(base64, "base64")
}

async function signAndUpload(page: Page, name: string, bytes: Buffer, size: { width: number; height: number }) {
  const sign = await page.request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
    headers: ADMIN,
    data: {
      originalName: name,
      contentType: "image/webp",
      size: bytes.length,
      ...size,
      hash: createHash("sha256").update(bytes).digest("hex"),
      tags: [],
    },
  })
  expect(sign.ok()).toBe(true)
  return (await sign.json()) as
    | { status: "upload"; mediaId: string; uploadUrl: string }
    | { status: "existing"; media: { id: string } }
}

async function put(url: string, body: Buffer): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/webp" }, body: new Uint8Array(body) })
  expect(res.ok).toBe(true)
}

test("a big picture is shrunk to WebP in the browser, a copy is not stored twice and the library finds it", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  const id = Date.now().toString(36)
  const name = `grande-photo-${id}.png`
  await loginAsOwnerAndWait(page)
  await page.goto(`${E2E.dashboardUrl}/media`)

  await step("drop a 3200 x 2200 PNG on the upload zone", async () => {
    const png = await drawn(page, "image/png", 3200, 2200)
    await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "image/png", buffer: png })
    await expect.poll(async () => (await mediaRows(`grande-photo-${id}%`)).length).toBe(1)
  })

  await step("it is a confirmed WebP no wider than 2400 pixels", async () => {
    const [row] = await mediaRows(`grande-photo-${id}%`)
    expect(row).toMatchObject({ mime: "image/webp", confirmed: true })
    expect(Math.max(row?.width ?? 0, row?.height ?? 0)).toBeLessThanOrEqual(2400)
    expect(row?.bytes).toBeLessThan(5 * 1024 * 1024)
  })

  await step("the same bytes are not stored again: sign answers with the existing image", async () => {
    const [row] = await mediaRows(`grande-photo-${id}%`)
    const again = await page.request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
      headers: ADMIN,
      data: {
        originalName: `copie-${id}.webp`,
        contentType: "image/webp",
        size: row?.bytes,
        width: row?.width,
        height: row?.height,
        hash: row?.hash,
        tags: [],
      },
    })
    expect(again.ok()).toBe(true)
    expect(((await again.json()) as { status: string }).status).toBe("existing")
    expect(await mediaRows(`copie-${id}%`)).toHaveLength(0)
  })

  await step("the library finds it by name", async () => {
    await page.reload()
    await page.getByRole("searchbox", { name: "Rechercher une photo" }).fill(`grande-photo-${id}`)
    await expect(page.getByText(`grande-photo-${id}`).first()).toBeVisible()
  })
})

test("the api refuses a file that is not the WebP it was signed as and leaves nothing behind", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  const png = await drawn(page, "image/png", 400, 300)
  const size = { width: 400, height: 300 }
  let mediaId = ""

  await step("a PNG uploaded under a WebP reservation is rejected at confirm", async () => {
    const sign = await signAndUpload(page, `faux-${Date.now().toString(36)}.webp`, png, size)
    if (sign.status !== "upload") throw new Error("expected a new upload")
    mediaId = sign.mediaId
    await put(sign.uploadUrl, png)
    const confirm = await page.request.post(`${E2E.apiUrl}/v1/admin/media/${mediaId}/confirm`, {
      headers: ADMIN,
      data: {},
    })
    expect(confirm.status()).toBe(400)
  })

  await step("no media row remains", async () => {
    expect(await mediaById(mediaId)).toBeNull()
  })

  await step("a signature for another content type or a tiny picture is refused", async () => {
    const bad = await page.request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
      headers: ADMIN,
      data: {
        originalName: "x.png",
        contentType: "image/png",
        size: 10,
        width: 400,
        height: 300,
        hash: "a".repeat(64),
      },
    })
    expect(bad.status()).toBe(400)
    const tiny = await page.request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
      headers: ADMIN,
      data: {
        originalName: "x.webp",
        contentType: "image/webp",
        size: 10,
        width: 20,
        height: 20,
        hash: "b".repeat(64),
      },
    })
    expect(tiny.status()).toBe(400)
  })
})

test("the cleanup cron deletes an image unused for 30 days, keeps a pinned one and a fresh one, and reports a dry run only", {
  tag: ["@fr", "@desktop"],
}, async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  const make = async (label: string, width: number): Promise<string> => {
    const webp = await drawn(page, "image/webp", width, 300)
    const sign = await signAndUpload(page, `${label}.webp`, webp, { width, height: 300 })
    if (sign.status !== "upload") throw new Error("expected a new upload")
    await put(sign.uploadUrl, webp)
    const confirm = await page.request.post(`${E2E.apiUrl}/v1/admin/media/${sign.mediaId}/confirm`, {
      headers: ADMIN,
      data: {},
    })
    expect(confirm.ok()).toBe(true)
    return sign.mediaId
  }
  const stamp = Date.now().toString(36)
  const stale = await make(`vieille-${stamp}`, 410)
  const pinned = await make(`epinglee-${stamp}`, 420)
  const fresh = await make(`recente-${stamp}`, 430)
  const cron = (query = "") =>
    page.request.post(`${E2E.apiUrl}/cron/media-cleanup${query}`, {
      headers: { authorization: `Bearer ${E2E.cronSecret}` },
    })

  await step("three confirmed images that nothing shows; two are 31 days unused, one of them pinned", async () => {
    await markMediaUnused(stale, 31)
    await markMediaUnused(pinned, 31)
    await pinMedia(pinned)
    for (const id of [stale, pinned, fresh]) expect((await mediaById(id))?.confirmed).toBe(true)
  })

  await step("a dry run reports and deletes nothing", async () => {
    const res = await cron("?dryRun=1")
    expect(res.status()).toBe(200)
    expect(await mediaById(stale)).not.toBeNull()
  })

  await step("the real run removes only the stale one", async () => {
    const res = await cron()
    expect(res.status()).toBe(200)
    expect(await mediaById(stale)).toBeNull()
    expect(await mediaById(pinned)).not.toBeNull()
    expect(await mediaById(fresh)).not.toBeNull()
  })

  await step("without the secret the job answers 401", async () => {
    expect((await page.request.post(`${E2E.apiUrl}/cron/media-cleanup`)).status()).toBe(401)
  })
})
