import { expect, test } from "bun:test"
import { chromium } from "@playwright/test"
import { assertLoopbackUrls, spoofedIp } from "../lib/guard"
import { applyNetwork, parseNetwork } from "../lib/net"
import { createPacer } from "../lib/pacing"

test("network rules parse, and a pattern that could hit every site is refused", () => {
  expect(parseNetwork("slow 4000 **/api/admin/**")).toEqual({ kind: "slow", ms: 4000, pattern: "**/api/admin/**" })
  expect(parseNetwork("status 500 **/api/**")).toEqual({ kind: "status", code: 500, pattern: "**/api/**" })
  expect(parseNetwork("fail **/api/**")).toEqual({ kind: "fail", pattern: "**/api/**" })
  expect(parseNetwork("reset")).toEqual({ kind: "reset" })
  expect(() => parseNetwork("fail **")).toThrow("must start with")
  expect(() => parseNetwork("slow 999999 **/api/**")).toThrow()
  expect(() => parseNetwork("status 200 **/api/**")).toThrow()
  expect(() => parseNetwork("explode")).toThrow("unknown network rule")
})

test("only documentation addresses can be spoofed, and only against loopback sites", () => {
  expect(spoofedIp("203.0.113.7")).toBe("203.0.113.7")
  expect(() => spoofedIp("8.8.8.8")).toThrow()
  expect(() => spoofedIp("203.0.113.999")).toThrow()
  expect(() => spoofedIp(undefined)).toThrow()
  expect(() => assertLoopbackUrls(["http://localhost:3000", "http://127.0.0.1:3100"])).not.toThrow()
  expect(() => assertLoopbackUrls(["http://localhost:3000", "https://ceraghit.example"])).toThrow("refusing")
})

test("steps send the spoofed address, drop the session, go back and break the network", async () => {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const seen: string[] = []
    await context.route("http://localhost:4999/**", (route) => {
      const url = new URL(route.request().url())
      seen.push(`${url.pathname} ${route.request().headers()["x-forwarded-for"] ?? "-"}`)
      return route.fulfill({
        contentType: "text/html",
        body:
          url.pathname === "/data"
            ? "{}"
            : `<a href="/two">deux</a><script>fetch("/data").then(r=>r.status).then(s=>document.title=String(s)).catch(()=>document.title="offline")</script>`,
      })
    })
    const pacer = createPacer({
      page,
      device: "desktop",
      app: "dashboard",
      baseUrl: () => "http://localhost:4999",
      assetsDir: "",
      zoom: false,
    })
    const run = (action: "ip" | "clear-cookies" | "back" | "network" | "goto", value?: string) =>
      pacer.run({ action, caption_fr: "Ok" }, value)

    await run("ip", "203.0.113.7")
    await run("goto", "/")
    expect(seen[0]).toBe("/ 203.0.113.7")

    await context.addCookies([{ name: "session", value: "x", url: "http://localhost:4999" }])
    await run("clear-cookies")
    expect(await context.cookies("http://localhost:4999")).toHaveLength(0)

    await page.getByRole("link", { name: "deux" }).click()
    await run("back")
    await page.waitForURL("http://localhost:4999/")

    await context.unroute("http://localhost:4999/**")
    await applyNetwork(context, parseNetwork("status 503 **/data"))
    await context.route("http://localhost:4999/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<script>fetch("/data").then(r=>document.title=String(r.status))</script>`,
      }),
    )
    await page.goto("http://localhost:4999/")
    await page.waitForFunction(() => document.title === "503")
    await run("network", "reset")
  } finally {
    await browser.close()
  }
})
