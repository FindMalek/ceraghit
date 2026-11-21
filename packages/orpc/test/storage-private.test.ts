import { afterEach, describe, expect, test } from "bun:test"
import { createStorage } from "../src/lib/storage"

const config = {
  endpoint: "https://s3.example.test",
  region: "auto",
  bucket: "bucket",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret-test-key",
  publicUrl: "https://cdn.example.test",
  prefix: "pr-1/",
}
const storage = createStorage(config)!
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe("private files", () => {
  test("a signed read never uses the public CDN, even when one is configured", async () => {
    const key = "pr-1/private/labels/abc.pdf"
    expect(await storage.readUrl(key)).toBe(`https://cdn.example.test/${key}`)
    const url = new URL(await storage.signedGet(key))
    expect(url.origin).toBe("https://s3.example.test")
    expect(url.pathname).toBe(`/bucket/${key}`)
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy()
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300")
  })

  test("the link can be made to download under a clean file name and live a chosen time", async () => {
    const url = new URL(await storage.signedGet("pr-1/private/labels/x.pdf", 120, 'etiquette "12/34".pdf'))
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120")
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="etiquette__12_34_.pdf"')
  })

  test("a private link never lives longer than an hour, whatever is asked", async () => {
    const url = new URL(await storage.signedGet("pr-1/private/labels/x.pdf", 7 * 86_400))
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600")
  })

  test("an object is written with a signed PUT and its content type", async () => {
    let seen: Request | undefined
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Request(input, init)
      return new Response(null, { status: 200 })
    }) as typeof fetch
    await storage.put("pr-1/private/labels/abc.pdf", new Uint8Array([37, 80, 68, 70]), "application/pdf")
    expect(seen?.method).toBe("PUT")
    expect(seen?.url).toBe("https://s3.example.test/bucket/pr-1/private/labels/abc.pdf")
    expect(seen?.headers.get("content-type")).toBe("application/pdf")
    expect(seen?.headers.get("authorization")).toContain("AWS4-HMAC-SHA256")
    expect([...new Uint8Array(await seen!.arrayBuffer())]).toEqual([37, 80, 68, 70])
  })

  test("a refused write is an error, never a silent success", async () => {
    globalThis.fetch = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch
    await expect(storage.put("k", new Uint8Array([1]), "application/pdf")).rejects.toThrow(
      /bucket write failed \(403\)/,
    )
  })
})
