import type { Locator, Page } from "@playwright/test"
import { captureDownload, hideFile, showFile } from "./files"
import { assertLoopbackUrls, spoofedIp } from "./guard"
import { applyNetwork, parseNetwork } from "./net"
import type { Device, Step, Target } from "./steps"

export const DEFAULT_HOLD_MS = 1200
export const STILL_MS = 1500

/** Small seeded generator so a re-run types at the same speed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 300 ms for a short hop up to 900 ms across the screen. */
export function moveDuration(distance: number): number {
  return Math.min(900, 300 + distance * 0.6)
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Only visible matches count: a list renders a table and cards, and the hidden one must not be picked on the other device. */
export function locate(page: Page, target: Target): Locator {
  const visible = anyMatch(page, target).filter({ visible: true })
  return target.nth === undefined ? visible : visible.nth(target.nth)
}

/** Visible or not: a file input is hidden behind its button. */
export function anyMatch(page: Page, target: Target): Locator {
  if (target.testId) return page.getByTestId(target.testId)
  if (target.role) {
    return page.getByRole(target.role as Parameters<Page["getByRole"]>[0], target.name ? { name: target.name } : {})
  }
  if (target.label) return page.getByLabel(target.label)
  if (target.text) return page.getByText(target.text)
  throw new Error("a step target needs role, label, text or testId")
}

export interface Point {
  x: number
  y: number
}

export interface Pacer {
  run(step: Step, value: string | undefined): Promise<void>
  zoomOut(): Promise<void>
}

export interface PacerOptions {
  page: Page
  device: Device
  baseUrl: (app: "web" | "dashboard") => string
  app: "web" | "dashboard"
  assetsDir: string
  /** Where `download` steps keep their files. */
  downloadsDir?: string
  zoom: boolean
  seed?: number
}

export function createPacer(options: PacerOptions): Pacer {
  const { page, device, zoom } = options
  const random = rng(options.seed ?? 2027)
  let at: Point = { x: 20, y: 20 }

  async function centerOf(target: Target): Promise<Point> {
    const el = locate(page, target).first()
    // Centered, not just "in view": a sticky header must not sit on top of the point we click.
    await el.waitFor({ state: "visible" })
    await el.evaluate((n) => n.scrollIntoView({ block: "center", inline: "nearest" }))
    const box = await el.boundingBox()
    if (!box) throw new Error("the target has no box")
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  async function glide(to: Point): Promise<void> {
    const distance = Math.hypot(to.x - at.x, to.y - at.y)
    const duration = moveDuration(distance)
    const frames = Math.max(8, Math.round(duration / 16))
    if (device === "desktop") {
      for (let i = 1; i <= frames; i++) {
        const k = ease(i / frames)
        await page.mouse.move(at.x + (to.x - at.x) * k, at.y + (to.y - at.y) * k)
        await sleep(duration / frames)
      }
    } else {
      await sleep(duration / 3)
    }
    at = to
  }

  async function zoomTo(p: Point): Promise<void> {
    if (!zoom) return
    await page.evaluate(
      ({ x, y, scale }) =>
        (window as unknown as { __demoZoom?: (x: number, y: number, s: number) => void }).__demoZoom?.(x, y, scale),
      { x: p.x, y: p.y, scale: device === "desktop" ? 1.35 : 1.25 },
    )
    await sleep(750)
  }

  async function press(target: Target): Promise<Point> {
    // A link that opens a new tab would leave the recorded page: follow it in the same tab.
    await locate(page, target)
      .first()
      .evaluate((el) => {
        if (el instanceof HTMLAnchorElement && el.target === "_blank") el.removeAttribute("target")
      })
    const p = await centerOf(target)
    await glide(p)
    await zoomTo(p)
    if (device === "mobile") await page.touchscreen.tap(p.x, p.y)
    else await page.mouse.click(p.x, p.y)
    return p
  }

  async function typeSlowly(text: string): Promise<void> {
    for (const ch of text) {
      await page.keyboard.type(ch)
      await sleep(70 + random() * 50)
    }
  }

  return {
    async zoomOut() {
      if (zoom)
        await page.evaluate(() =>
          (window as unknown as { __demoZoom?: (x: number, y: number, s: number) => void }).__demoZoom?.(0, 0, 1),
        )
    },
    async run(step, value) {
      const { action, target } = step
      await hideFile(page)
      switch (action) {
        case "ip": {
          assertLoopbackUrls([options.baseUrl("web"), options.baseUrl("dashboard")])
          await page.context().setExtraHTTPHeaders({ "x-forwarded-for": spoofedIp(value) })
          break
        }
        case "clear-cookies":
          await page.context().clearCookies()
          break
        case "back":
          await page.goBack()
          break
        case "network":
          await applyNetwork(page.context(), parseNetwork(value))
          break
        case "download": {
          if (!target) throw new Error("download needs a target")
          const file = await captureDownload(page, options.downloadsDir ?? "out/downloads", () => press(target))
          await showFile(page, file)
          break
        }
        case "goto": {
          await page.goto(new URL(value ?? "/", options.baseUrl(options.app)).toString())
          break
        }
        case "click":
        case "tap":
          if (!target) throw new Error(`${action} needs a target`)
          await press(target)
          break
        case "fill":
        case "type":
          if (!target) throw new Error(`${action} needs a target`)
          await press(target)
          await page.keyboard.press("ControlOrMeta+a")
          await page.keyboard.press("Backspace")
          await typeSlowly(value ?? "")
          break
        case "select":
          if (!target) throw new Error("select needs a target")
          await glide(await centerOf(target))
          await locate(page, target)
            .first()
            .selectOption({ label: value ?? "" })
          break
        case "upload":
          if (!target) throw new Error("upload needs a target")
          await (target.nth === undefined ? anyMatch(page, target) : anyMatch(page, target).nth(target.nth))
            .first()
            .setInputFiles(`${options.assetsDir}/${value ?? ""}`)
          break
        case "hover":
          if (!target) throw new Error("hover needs a target")
          if (device === "desktop") await glide(await centerOf(target))
          else await centerOf(target)
          break
        case "scroll": {
          const total = Number(value ?? 600)
          const chunks = Math.max(1, Math.round(Math.abs(total) / 40))
          for (let i = 0; i < chunks; i++) {
            await page.evaluate((dy) => window.scrollBy(0, dy), total / chunks)
            await sleep(16)
          }
          break
        }
        case "press":
          await page.keyboard.press(value ?? "Enter")
          break
        case "wait":
          break
        case "drag": {
          if (!target || !step.to) throw new Error("drag needs target and to")
          const from = await centerOf(target)
          const to = await centerOf(step.to)
          await glide(from)
          await page.mouse.down()
          await glide(to)
          await page.mouse.up()
          break
        }
      }
    },
  }
}
