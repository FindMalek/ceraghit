import Image, { type ImageProps } from "next/image"

/**
 * next/image with one rule: static catalogue photos (`/catalogue/...`) are resized per device by Next, uploaded photos
 * (`/api/files/...`, a redirect to the CDN) are served as they are because the dashboard already compressed them.
 */
export default function Photo(props: ImageProps) {
  const unoptimized = typeof props.src === "string" && props.src.startsWith("/api/")
  return <Image {...props} unoptimized={unoptimized} />
}
