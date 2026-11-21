import { browserClient } from "@workspace/orpc/react"
import { fitWithin, REQUEST_IMAGE_MAX_BYTES, REQUEST_IMAGE_MAX_SIDE } from "@workspace/sdk"

const QUALITY = 0.82

export class PhotoError extends Error {
  constructor(readonly kind: "unavailable" | "tooMany" | "tooLarge" | "type" | "failed") {
    super(kind)
  }
}

/** The browser's own WebP encoder when it has one, the wasm one (Safari) otherwise. */
async function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  const native = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY))
  if (native?.type === "image/webp") return native
  const context = canvas.getContext("2d")
  if (!context) throw new PhotoError("type")
  const { default: encode } = await import("@jsquash/webp/encode")
  const data = await encode(context.getImageData(0, 0, canvas.width, canvas.height), { quality: QUALITY * 100 })
  return new Blob([data], { type: "image/webp" })
}

/** Every photo goes up as WebP, at most 1600px on the long side: the original file is never uploaded. */
export async function toWebp(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new PhotoError("type")
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, REQUEST_IMAGE_MAX_SIDE)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height)
    return await encodeWebp(canvas)
  } catch (error) {
    throw error instanceof PhotoError ? error : new PhotoError("type")
  } finally {
    bitmap.close()
  }
}

/** Asks the api for a signed url, then PUTs the bytes straight to the bucket. Returns the `s3:` key to save. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await toWebp(file)
  if (blob.size > REQUEST_IMAGE_MAX_BYTES) throw new PhotoError("tooLarge")
  let target: { uploadUrl: string; image: string }
  try {
    target = await browserClient.public.requests.uploadUrl({ contentType: "image/webp", size: blob.size })
  } catch (error) {
    const code = (error as { code?: string }).code
    throw new PhotoError(
      code === "SERVICE_UNAVAILABLE" ? "unavailable" : code === "TOO_MANY_REQUESTS" ? "tooMany" : "failed",
    )
  }
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": "image/webp" }, body: blob })
  if (!res.ok) throw new PhotoError("failed")
  return target.image
}
