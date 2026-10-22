// Deletes a closed PR's uploads (pr-<n>/ in the dev bucket). Run with bun: bun scripts/deploy/preview-storage-cleanup.ts
const pr = process.env.PR_NUMBER
const { S3_ENDPOINT, PREVIEW_S3_BUCKET, PREVIEW_S3_ACCESS_KEY_ID, PREVIEW_S3_SECRET_ACCESS_KEY } = process.env
if (!pr || !S3_ENDPOINT || !PREVIEW_S3_BUCKET || !PREVIEW_S3_ACCESS_KEY_ID || !PREVIEW_S3_SECRET_ACCESS_KEY) {
  console.info("storage not configured, nothing to clean")
  process.exit(0)
}
const client = new Bun.S3Client({
  endpoint: S3_ENDPOINT,
  region: process.env.S3_REGION ?? "garage",
  bucket: PREVIEW_S3_BUCKET,
  accessKeyId: PREVIEW_S3_ACCESS_KEY_ID,
  secretAccessKey: PREVIEW_S3_SECRET_ACCESS_KEY,
})
let removed = 0
for (;;) {
  const page = await client.list({ prefix: `pr-${pr}/`, maxKeys: 1000 })
  const keys = (page.contents ?? []).map((o) => o.key)
  if (!keys.length) break
  await Promise.all(keys.map((k) => client.delete(k)))
  removed += keys.length
}
console.info(`removed ${removed} objects under pr-${pr}/`)
