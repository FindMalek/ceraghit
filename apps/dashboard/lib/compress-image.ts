import { fitWithin, MEDIA_MAX_SIDE, MEDIA_MIN_SIDE } from "@workspace/sdk"

/** Long side of a stored photo: sharp on a retina product page, a third of what a phone camera produces. */
export const MAX_SIDE = MEDIA_MAX_SIDE
const QUALITY = 0.86

export const UNSUPPORTED_FORMAT = "Ce format n'est pas pris en charge. Essayez une photo JPG ou PNG."

/** Media library only (the legacy upload accepts small icons): refuses a picture under `MEDIA_MIN_SIDE`. */
export function assertMediaSize(width: number, height: number): void {
  if (Math.min(width, height) < MEDIA_MIN_SIDE) {
    throw new Error(`Cette image est trop petite : ${MEDIA_MIN_SIDE} px minimum sur le petit côté.`)
  }
}

/** The browser's own WebP encoder when it has one, the wasm one (Safari) otherwise, loaded only on that path. */
async function encodeWebp(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): Promise<Blob | null> {
  const native = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY))
  if (native?.type === "image/webp") return native
  const { default: encode } = await import("@jsquash/webp/encode")
  const data = await encode(context.getImageData(0, 0, canvas.width, canvas.height), { quality: QUALITY * 100 })
  return new Blob([data], { type: "image/webp" })
}

/**
 * Re-encodes a photo as WebP in the browser before it is uploaded: at most 2400px on the long side, quality 0.86, which
 * is visually the same and typically 5 to 10 times smaller. Keeps the original when it is already smaller.
 */
export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new Error(UNSUPPORTED_FORMAT)
  }
  try {
    const source = { width: bitmap.width, height: bitmap.height }
    if (
      file.type === "image/webp" &&
      Math.max(source.width, source.height) <= MAX_SIDE &&
      file.size <= 5 * 1024 * 1024
    ) {
      bitmap.close()
      return file
    }
    const { width, height } = fitWithin(source.width, source.height, MAX_SIDE)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return file
    context.imageSmoothingQuality = "high"
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await encodeWebp(canvas, context)
    if (blob?.type !== "image/webp") return file
    const unchanged = width === source.width && height === source.height
    if (unchanged && file.type === "image/webp" && blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" })
  } catch {
    return file
  }
}
