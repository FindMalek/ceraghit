import { browserClient } from "@workspace/orpc/react"
import { REQUEST_IMAGE_MAX_BYTES } from "@workspace/sdk"

const MAX_SIDE = 1600

/** Shrinks a phone photo to at most 1600px as a JPEG, far below the 5 MB limit. Falls back to the file as is. */
export async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * ratio)
    canvas.height = Math.round(bitmap.height * ratio)
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

export class PhotoError extends Error {
  constructor(readonly kind: "unavailable" | "tooLarge" | "type" | "failed") {
    super(kind)
  }
}

/** Asks the api for a signed url, then PUTs the bytes straight to the bucket. Returns the `s3:` key to save. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await downscale(file)
  if (blob.size > REQUEST_IMAGE_MAX_BYTES) throw new PhotoError("tooLarge")
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new PhotoError("type")
  let target: { uploadUrl: string; image: string }
  try {
    target = await browserClient.public.requests.uploadUrl({ contentType: blob.type as "image/jpeg", size: blob.size })
  } catch (error) {
    const code = (error as { code?: string }).code
    throw new PhotoError(code === "SERVICE_UNAVAILABLE" ? "unavailable" : "failed")
  }
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": blob.type }, body: blob })
  if (!res.ok) throw new PhotoError("failed")
  return target.image
}
