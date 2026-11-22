/**
 * Uploads a folder of tutorial videos to the bucket of the CURRENT environment and writes tutorials/manifest.json last.
 * The folder holds `<id>-<desktop|mobile>.mp4`, `<id>-<desktop|mobile>.vtt` and `<id>.jpg` (ids from the catalogue).
 *
 *   pnpm tutorials:upload <folder> [--dry-run]
 *   pnpm tutorials:upload:production <folder> [--dry-run]   (S3_* production credentials already exported in the shell)
 *
 * The bucket comes from APP_ENV, DEPLOY_ENV and S3_* exactly like the api. Production needs `--env production --confirm`
 * (the :production script passes both) and never reads an env file. Idempotent: identical objects are skipped, so an
 * interrupted run is resumed by running it again. See docs/tutorials.md.
 */
import { spawnSync } from "node:child_process"
import { createS3Bucket, resolveTarget, uploadTutorials } from "@workspace/orpc/tutorial-upload"

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const optionValue = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--env")
if (!dir) {
  console.error("usage: tutorials:upload <folder> [--dry-run] [--env production --confirm]")
  process.exit(1)
}

function probeSeconds(path: string): number | null {
  const res = spawnSync(
    process.env.FFPROBE || "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  )
  const seconds = Number(res.stdout?.trim())
  return res.status === 0 && Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

try {
  const target = resolveTarget(process.env, { env: optionValue("--env"), confirm: flag("--confirm") })
  const dryRun = flag("--dry-run")
  console.info(
    `${dryRun ? "dry run: " : ""}${target.env} bucket ${target.config.bucket} at ${target.config.endpoint}, prefix "${target.prefix}"`,
  )
  const report = await uploadTutorials({
    bucket: createS3Bucket(target.config),
    prefix: target.prefix,
    dir,
    dryRun,
    probeSeconds,
    log: (line) => console.info(line),
  })
  for (const line of report.rejected) console.warn(`rejected ${line}`)
  for (const line of report.incomplete) console.warn(`incomplete ${line}`)
  console.info(
    `${report.uploaded.length} uploaded, ${report.skipped.length} unchanged, ${report.listed.length} listed, ${report.incomplete.length} incomplete, ${report.rejected.length} rejected`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : "upload failed")
  process.exit(1)
}
