import { browserClient } from "@workspace/orpc/react"
import { assertMediaSize, compressImage } from "@/lib/compress-image"

export type UploadPhase = "compress" | "send" | "check" | "done" | "existing" | "error"

export const NO_WEBP_MESSAGE =
  "Ce navigateur ne sait pas préparer les photos pour la médiathèque. Utilisez Chrome, ou ajoutez la photo depuis la fiche d'un produit."

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Compress to WebP, reserve with a hash (duplicates come back as "existing"), PUT, confirm. */
export async function uploadMedia(original: File, onPhase: (phase: UploadPhase) => void) {
  onPhase("compress")
  const file = await compressImage(original)
  if (file.type !== "image/webp") throw new Error(NO_WEBP_MESSAGE)
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  assertMediaSize(width, height)
  const signed = await browserClient.admin.media.sign({
    originalName: original.name,
    contentType: "image/webp",
    size: file.size,
    width,
    height,
    hash: await sha256(file),
    tags: [],
  })
  if (signed.status === "existing") {
    onPhase("existing")
    return signed.media
  }
  onPhase("send")
  const res = await fetch(signed.uploadUrl, { method: "PUT", headers: { "content-type": "image/webp" }, body: file })
  if (!res.ok) throw new Error("L'envoi a échoué. Réessayez.")
  onPhase("check")
  const media = await browserClient.admin.media.confirm({ id: signed.mediaId })
  onPhase("done")
  return media
}
