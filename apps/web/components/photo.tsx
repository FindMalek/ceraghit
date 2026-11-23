import Image, { type ImageProps } from "next/image"
import { isSignedUpload, photoSrc } from "@/lib/photo-src"

/**
 * next/image with one rule: every photo is resized per device by Next (bundled `/catalogue/...` and uploads served
 * from the public CDN host), except uploads that only exist behind a signed url (`/api/files/...` on the homelab).
 */
export default function Photo(props: ImageProps) {
  const src = typeof props.src === "string" ? photoSrc(props.src) : props.src
  const unoptimized = typeof src === "string" && isSignedUpload(src)
  return <Image {...props} src={src} unoptimized={unoptimized} />
}
