import { E2E } from "../../env"
import { expect, test } from "../../fixtures"
import { dbQuery } from "../../helpers/catalogue"

const ONCE = { tag: ["@fr", "@desktop"] }
const CSRF = { "x-csrf-token": "orpc" }

test.describe.configure({ mode: "serial" })

test("a visitor cannot ask for an admin upload url", ONCE, async ({ request, step }) => {
  await step("sign, confirm and delete of the media library answer 401", async () => {
    const sign = await request.post(`${E2E.apiUrl}/v1/admin/media/sign`, {
      headers: CSRF,
      data: {
        originalName: "x.webp",
        contentType: "image/webp",
        size: 5000,
        width: 400,
        height: 300,
        hash: "a".repeat(64),
      },
    })
    expect(sign.status()).toBe(401)
    const confirm = await request.post(`${E2E.apiUrl}/v1/admin/media/00000000-0000-4000-8000-000000000000/confirm`, {
      headers: CSRF,
      data: {},
    })
    expect(confirm.status()).toBe(401)
    const remove = await request.delete(`${E2E.apiUrl}/v1/admin/media/00000000-0000-4000-8000-000000000000`, {
      headers: CSRF,
    })
    expect(remove.status()).toBe(401)
  })
})

test("the public photo upload refuses what is not a small image", ONCE, async ({ request, step }) => {
  const url = `${E2E.apiUrl}/v1/requests/upload-url`
  await step("a text file, a script and an empty file are refused", async () => {
    for (const data of [
      { contentType: "text/plain", size: 100 },
      { contentType: "application/javascript", size: 100 },
      { contentType: "image/svg+xml", size: 100 },
      { contentType: "image/png", size: 0 },
    ]) {
      const res = await request.post(url, { data })
      expect(res.status(), JSON.stringify(data)).toBe(400)
    }
  })
  await step("a photo over the size limit is refused", async () => {
    const res = await request.post(url, { data: { contentType: "image/png", size: 100 * 1024 * 1024 } })
    expect(res.status()).toBe(400)
  })
})

test(
  "the 13th photo upload url in ten minutes from one address is refused, and a neighbour is not",
  ONCE,
  async ({ request, step }) => {
    const url = `${E2E.apiUrl}/v1/requests/upload-url`
    const ip = `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.77`
    const keys: string[] = []
    const ask = (address: string) =>
      request.post(url, { headers: { "x-forwarded-for": address }, data: { contentType: "image/webp", size: 2000 } })
    try {
      await step("twelve urls are given", async () => {
        for (let n = 0; n < 12; n++) {
          const res = await ask(ip)
          expect(res.status(), `request ${n + 1}`).toBe(200)
          keys.push(((await res.json()) as { image: string }).image.replace(/^s3:/, ""))
        }
      })
      await step("the thirteenth answers 429 with a guest-safe message", async () => {
        const res = await ask(ip)
        expect(res.status()).toBe(429)
        expect(await res.text()).toContain("Too many uploads")
      })
      await step("another address still gets its url", async () => {
        const res = await ask(`10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.78`)
        expect(res.status()).toBe(200)
        keys.push(((await res.json()) as { image: string }).image.replace(/^s3:/, ""))
      })
    } finally {
      for (const key of keys) await dbQuery("delete from uploads where key = $1", [key])
      await dbQuery("delete from rate_limits where key like $1", [`%${ip}%`])
    }
  },
)
