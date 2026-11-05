import { fitWithin } from "@workspace/sdk"

/** Long side of a stored photo: sharp on a retina product page, a third of what a phone camera produces. */
export const MAX_SIDE = 2400
const QUALITY = 0.86

/**
 * Re-encodes a photo as WebP in the browser before it is uploaded: at most 2400px on the long side, quality 0.86, which
 * is visually the same and typically 5 to 10 times smaller. Keeps the original when it is already smaller or the browser
 * cannot encode WebP.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    const source = { width: bitmap.width, height: bitmap.height }
    const { width, height } = fitWithin(source.width, source.height, MAX_SIDE)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return file
    context.imageSmoothingQuality = "high"
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY))
    if (blob?.type !== "image/webp") return file
    const unchanged = width === source.width && height === source.height
    if (unchanged && file.type === "image/webp" && blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" })
  } catch {
    return file
  }
}
