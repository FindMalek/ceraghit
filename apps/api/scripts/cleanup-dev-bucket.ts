/**
 * Daily housekeeping of the homelab bucket (previews, staging, local): removes everything under `pr-<n>/` once that PR
 * is no longer open, and any other object older than MAX_AGE_DAYS. Never touches another bucket than `ceraghit-dev`.
 *
 *   S3_ENDPOINT=… S3_BUCKET=ceraghit-dev S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… OPEN_PRS=61,62 bun apps/api/scripts/cleanup-dev-bucket.ts
 * DRY_RUN=true only prints what would go.
 */
import { createStorage } from "@workspace/orpc"

const env = process.env
if (env.S3_BUCKET !== "ceraghit-dev") throw new Error(`refusing to clean "${env.S3_BUCKET}", only ceraghit-dev`)

const storage = createStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION ?? "garage",
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  prefix: "",
})
if (!storage) throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required")

const openPrs = new Set((env.OPEN_PRS ?? "").split(",").filter(Boolean))
const maxAge = Number(env.MAX_AGE_DAYS ?? 14) * 86_400_000
const dryRun = env.DRY_RUN === "true"
const now = Date.now()

let deleted = 0
let freed = 0
const objects = await storage.list()
for (const object of objects) {
  const pr = object.key.match(/^pr-(\d+)\//)?.[1]
  const closedPr = pr !== undefined && !openPrs.has(pr)
  const stale = now - object.modifiedAt.getTime() > maxAge
  if (!closedPr && !stale) continue
  console.info(`${dryRun ? "would delete" : "delete"} ${object.key} (${object.size} bytes)`)
  if (!dryRun) await storage.remove(object.key)
  deleted++
  freed += object.size
}
console.info(`${objects.length} objects, ${deleted} ${dryRun ? "to delete" : "deleted"}, ${freed} bytes`)
