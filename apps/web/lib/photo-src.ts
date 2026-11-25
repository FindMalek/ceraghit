const FILES_PREFIX = "/api/files/"

/**
 * An uploaded photo (`/api/files/<key>`) points at the public CDN host when there is one (production: R2 behind
 * `S3_PUBLIC_URL`), so the image optimizer fetches the file itself instead of a redirect. Without a public host
 * (homelab, local) the url stays the api redirect: it is a signed url that expires, so it is served as it is.
 */
export function photoSrc(src: string, filesUrl = process.env.NEXT_PUBLIC_FILES_URL): string {
  if (!filesUrl || !src.startsWith(FILES_PREFIX)) return src
  // Carrier labels and other private files are never public: they only go through the signed redirect.
  if (/(^|\/)private\//.test(src.slice(FILES_PREFIX.length))) return src
  return `${filesUrl}/${src.slice(FILES_PREFIX.length)}`
}

/** Served as it is: signed urls cannot be cached by the optimizer. */
export function isSignedUpload(src: string): boolean {
  return src.startsWith("/api/")
}
