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
  }
}
