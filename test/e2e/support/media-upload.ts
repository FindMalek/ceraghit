import { createHash } from "node:crypto"
import type { Page } from "@playwright/test"
import { E2E } from "../env"
import { dbQuery } from "../helpers/catalogue"

export const ADMIN = { "x-csrf-token": "orpc" }

/** A WebP drawn by the browser itself, so no binary file lives in the repo. Each one is different (random tint). */
export async function drawnWebp(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
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
      for (let i = 0; i < width / 4; i++) {
        ctx.fillStyle = `rgb(${tint()}, ${tint()}, ${tint()})`
        ctx.fillRect(Math.random() * width, Math.random() * height, 24, 24)
      }
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/webp", 0.9))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ""
      for (const b of bytes) binary += String.fromCharCode(b)
      return btoa(binary)
    },
    { width, height },
  )
  return Buffer.from(base64, "base64")
}

/** Library image through the real sign, PUT and confirm calls, as the browser does. Returns the media id. */
export async function uploadImage(page: Page, name: string, width: number, height: number): Promise<string> {
  const bytes = await drawnWebp(page, width, height)
  const sign = await page.request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
    headers: ADMIN,
    data: {
      originalName: `${name}.webp`,
      contentType: "image/webp",
      size: bytes.length,
      width,
      height,
      hash: createHash("sha256").update(bytes).digest("hex"),
      tags: [],
    },
  })
  const body = (await sign.json()) as { status: string; mediaId: string; uploadUrl: string }
  if (body.status !== "upload") throw new Error(`expected a new upload, got ${body.status}`)
  const put = await fetch(body.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/webp" },
    body: new Uint8Array(bytes),
  })
  if (!put.ok) throw new Error(`bucket refused the image: ${put.status}`)
  const confirm = await page.request.post(`${E2E.apiUrl}/v1/admin/media/${body.mediaId}/confirm`, {
    headers: ADMIN,
    data: {},
  })
  if (!confirm.ok()) throw new Error(`confirm failed: ${confirm.status()}`)
  return body.mediaId
}

/** A draft product with the given library images in that order, made through the admin api. */
export async function createProductWithImages(page: Page, ref: string, mediaIds: string[]): Promise<string> {
  const [category] = await dbQuery<{ id: string }>("select id from categories limit 1", [])
  const res = await page.request.post(`${E2E.apiUrl}/v1/admin/products`, {
    headers: ADMIN,
    data: {
      ref,
      categoryId: category?.id,
      title: { fr: `Pièce ${ref}` },
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      priceTnd: 100000,
      priceEur: 3000,
      stock: 1,
      images: mediaIds.map((mediaId, i) => ({ mediaId, isMain: i === 0 })),
    },
  })
  if (!res.ok()) throw new Error(`product create failed: ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

/** The product's photos, in gallery order, by library file name. */
export async function galleryNames(productId: string): Promise<string[]> {
  const rows = await dbQuery<{ filename: string }>(
    `select m.filename from product_images pi join media m on m.id = pi.media_id
     where pi.product_id = $1 order by pi.position`,
    [productId],
  )
  return rows.map((r) => r.filename)
}

/** Removes library images a spec made, through the api so the bucket object goes too (after their product is gone). */
export async function removeImages(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await page.request.delete(`${E2E.apiUrl}/v1/admin/media/${id}`, { headers: ADMIN })
}
