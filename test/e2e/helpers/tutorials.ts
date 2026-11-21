import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { AwsClient } from "aws4fetch"
import { E2E } from "../env"

const aws = new AwsClient({
  accessKeyId: E2E.s3.accessKeyId,
  secretAccessKey: E2E.s3.secretAccessKey,
  region: E2E.s3.region,
  service: "s3",
})
const objectUrl = (key: string) => `${E2E.s3.endpoint}/${E2E.s3.bucket}/${key}`
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/tutorials/${name}`, import.meta.url)))

const FILES = { desktop: true, mobile: true, captions: true, poster: true }
export const PUBLISHED = "07-rechercher-produit"

/**
 * Playwright's Chromium has no H.264, so the sample is a VP8 webm stored under the usual `.mp4` key: the player
 * does not care about the extension and Chromium sniffs the container.
 * The one video the e2e bucket holds: a 1 second sample under the keys the recorder upload uses, plus the manifest. */
const OBJECTS: [string, Buffer | string, string][] = [
  ["tutorials/manifest.json", JSON.stringify({ videos: { [PUBLISHED]: FILES } }), "application/json"],
  [`tutorials/${PUBLISHED}.jpg`, fixture("poster.jpg"), "image/jpeg"],
  ...(["desktop", "mobile"] as const).flatMap((device): [string, Buffer, string][] => [
    [`tutorials/${PUBLISHED}-${device}.mp4`, fixture("sample.webm"), "video/webm"],
    [`tutorials/${PUBLISHED}-${device}.vtt`, fixture("sample.vtt"), "text/vtt"],
  ]),
]

export async function publishTutorialFixtures(): Promise<void> {
  for (const [key, body, type] of OBJECTS) {
    const res = await aws.fetch(objectUrl(key), {
      method: "PUT",
      body: typeof body === "string" ? body : new Uint8Array(body),
      headers: { "content-type": type },
    })
    if (!res.ok) throw new Error(`upload of ${key} failed (${res.status})`)
  }
}

export async function removeTutorialFixtures(): Promise<void> {
  for (const [key] of OBJECTS) await aws.fetch(objectUrl(key), { method: "DELETE" })
}
