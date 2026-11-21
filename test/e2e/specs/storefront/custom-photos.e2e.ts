import { randomInt, randomUUID } from "node:crypto"
import { crc32, deflateSync } from "node:zlib"
import { AwsClient } from "aws4fetch"
import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"
import { t } from "../../helpers/messages"

const aws = new AwsClient({
  accessKeyId: E2E.s3.accessKeyId,
  secretAccessKey: E2E.s3.secretAccessKey,
  region: E2E.s3.region,
  service: "s3",
})

/** A plain 2400x1600 RGB PNG: bigger than the 1600px a stored photo may have, and not a WebP. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xb4)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

test("a photo on a custom request is stored as a bounded WebP, whatever file was picked", async ({
  page,
  home,
  appLocale,
  step,
}) => {
  const id = randomUUID().slice(0, 8)
  const email = `photo+${id}@example.test`
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` })
  await page.goto(home("/custom"))
  await step("the page's policy lets wasm compile (the WebP encoder fallback for Safari)", async () => {
    const compiled = await page.evaluate(async () => {
      try {
        await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
        return true
      } catch {
        return false
      }
    })
    expect(compiled).toBe(true)
  })
  await step("fill the form and pick a PNG", async () => {
    await page.getByLabel(t(appLocale, "custom.name")).fill(`Photo ${id}`)
    await page.getByLabel(t(appLocale, "custom.email")).fill(email)
    await page.getByLabel(t(appLocale, "custom.description")).fill("A vase with a photo attached, e2e request")
    await page
      .locator("#request-photos")
      .setInputFiles({ name: "vase.png", mimeType: "image/png", buffer: png(2400, 1600) })
    await expect(page.getByText(t(appLocale, "custom.photoUploading"))).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByRole("button", { name: t(appLocale, "custom.removePhoto") })).toBeVisible()
  })
  await step("send it", async () => {
    await page.getByRole("button", { name: t(appLocale, "custom.submit") }).click()
    await expect(page.getByText(t(appLocale, "custom.successTitle"))).toBeVisible()
  })
  const [row] = await dbQuery<{ images: string[] }>("select images from custom_requests where email = $1", [email])
  expect(row?.images).toHaveLength(1)
  expect(row?.images[0]).toMatch(/^s3:.*requests\/.+\.webp$/)

  const res = await aws.fetch(`${E2E.s3.endpoint}/${E2E.s3.bucket}/${row!.images[0]!.slice(3)}`)
  expect(res.ok).toBe(true)
  const bytes = new Uint8Array(await res.arrayBuffer())
  expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF")
  expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WEBP")
  expect(bytes.length).toBeLessThan(2 * 1024 * 1024)
})
