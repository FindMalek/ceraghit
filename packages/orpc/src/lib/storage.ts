import { AwsClient } from "aws4fetch"

export interface StorageConfig {
  endpoint?: string
  region: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  /** Public base url of the bucket (R2 custom domain). Empty on the homelab: files go through the api instead. */
  publicUrl?: string
  /** `pr-<n>/` on previews, so a closed PR's uploads can be deleted together. */
  prefix: string
}

export interface Storage {
  bucket: string
  prefix: string
  /**
   * A signed PUT the browser uploads to directly, so the bytes never pass through a serverless function.
   * With `size` the content type and length are part of the signature: the bucket refuses any other upload.
   */
  presignPut(key: string, contentType: string, size?: number): Promise<string>
  /** Whether the object exists, used to check a customer's upload really happened before saving its key. */
  head(key: string): Promise<boolean>
  /** What an `<img>` should load: the CDN url when configured, otherwise a short-lived signed GET. */
  readUrl(key: string): Promise<string>
  publicUrl(key: string): string | null
  remove(key: string): Promise<void>
  /** Every object under `prefix` (the bucket root when empty), for the cleanup of the dev bucket. */
  list(prefix?: string): Promise<{ key: string; size: number; modifiedAt: Date }[]>
}

/** S3-compatible (Cloudflare R2 in production, Garage on the homelab) through plain signed fetches. */
export function createStorage(config: StorageConfig): Storage | null {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey, prefix } = config
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" })
  const urlFor = (key: string) => `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`
  const publicBase = config.publicUrl?.replace(/\/$/, "")

  /** `bind` also signs content-type and content-length, which aws4fetch leaves out unless `allHeaders` is set. */
  async function presign(
    method: "GET" | "PUT",
    key: string,
    expires: number,
    headers?: Record<string, string>,
    bind = false,
  ) {
    const url = new URL(urlFor(key))
    url.searchParams.set("X-Amz-Expires", String(expires))
    const signed = await aws.sign(new Request(url, { method, headers }), {
      aws: { signQuery: true, allHeaders: bind },
    })
    return signed.url
  }

  return {
    bucket,
    prefix,
    presignPut: (key, contentType, size) =>
      size === undefined
        ? presign("PUT", key, 600, { "content-type": contentType })
        : presign("PUT", key, 600, { "content-type": contentType, "content-length": String(size) }, true),
    async head(key) {
      const res = await aws.fetch(urlFor(key), { method: "HEAD" })
      return res.ok
    },
    readUrl: (key) => (publicBase ? Promise.resolve(`${publicBase}/${key}`) : presign("GET", key, 3600)),
    publicUrl: (key) => (publicBase ? `${publicBase}/${key}` : null),
    async remove(key) {
      await aws.fetch(urlFor(key), { method: "DELETE" })
    },
    async list(listPrefix = "") {
      const found: { key: string; size: number; modifiedAt: Date }[] = []
      let token: string | null = null
      do {
        const url = new URL(`${endpoint.replace(/\/$/, "")}/${bucket}`)
        url.searchParams.set("list-type", "2")
        if (listPrefix) url.searchParams.set("prefix", listPrefix)
        if (token) url.searchParams.set("continuation-token", token)
        const res = await aws.fetch(url)
        if (!res.ok) throw new Error(`bucket listing failed (${res.status})`)
        const xml = await res.text()
        for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = block?.match(/<Key>([\s\S]*?)<\/Key>/)?.[1]
          const size = block?.match(/<Size>(\d+)<\/Size>/)?.[1]
          const modified = block?.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1]
          if (key && size && modified) found.push({ key, size: Number(size), modifiedAt: new Date(modified) })
        }
        token = xml.includes("<IsTruncated>true</IsTruncated>")
          ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null)
          : null
      } while (token)
      return found
    },
  }
}
