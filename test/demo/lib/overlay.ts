import type { BrowserContext } from "@playwright/test"

/** Runs in every page of the context. Visual only: pointer-events none, above everything, positioned in page coordinates so zooming the page keeps it aligned. */
function install(): void {
  const mount = () => {
    if (document.getElementById("__demo")) return
    const root = document.createElement("div")
    root.id = "__demo"
    root.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647"
    root.innerHTML = `
      <svg id="__demo_cursor" width="28" height="28" viewBox="0 0 24 24" style="position:absolute;left:0;top:0;display:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
        <path d="M3 2l7.5 18 2.3-7.2L20 10.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`
    // The screencast sends nothing while the page is still, even when a focus ring appears. A 1px dot that never stops
    // fading keeps frames coming, so every change shows in the video.
    const tick = document.createElement("style")
    tick.textContent =
      "@keyframes __demo_tick{from{opacity:.98}to{opacity:1}}#__demo::after{content:'';position:fixed;right:0;bottom:0;width:1px;height:1px;background:rgba(0,0,0,.02);animation:__demo_tick .5s linear infinite alternate}"
    root.appendChild(tick)
    document.documentElement.appendChild(root)
    const cursor = root.querySelector<SVGElement>("#__demo_cursor")
    let client = { x: -100, y: -100 }
    const place = () => {
      if (!cursor) return
      cursor.style.transform = `translate(${client.x + window.scrollX}px, ${client.y + window.scrollY}px)`
    }
    const pulse = (x: number, y: number, size: number, color: string) => {
      const ring = document.createElement("div")
      ring.style.cssText = `position:absolute;left:${x + window.scrollX - size / 2}px;top:${y + window.scrollY - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:.55;transform:scale(.3);transition:transform .55s ease-out,opacity .55s ease-out`
      root.appendChild(ring)
      requestAnimationFrame(() => {
        ring.style.transform = "scale(1.3)"
        ring.style.opacity = "0"
      })
      setTimeout(() => ring.remove(), 700)
    }
    const touch = matchMedia("(pointer: coarse)").matches
    document.addEventListener(
      "mousemove",
      (e) => {
        if (touch) return
        client = { x: e.clientX, y: e.clientY }
        if (cursor) cursor.style.display = "block"
        place()
      },
      true,
    )
    document.addEventListener("mousedown", (e) => !touch && pulse(e.clientX, e.clientY, 54, "#c2410c"), true)
    document.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0]
        if (t) pulse(t.clientX, t.clientY, 96, "#ffffff")
      },
      true,
    )
    window.addEventListener("scroll", place, { passive: true })
    ;(window as unknown as { __demoZoom: (x: number, y: number, scale: number) => void }).__demoZoom = (
      x,
      y,
      scale,
    ) => {
      const html = document.documentElement
      html.style.transformOrigin = `${x + window.scrollX}px ${y + window.scrollY}px`
      html.style.transition = "transform .7s cubic-bezier(.4,0,.2,1)"
      html.style.transform = scale === 1 ? "" : `scale(${scale})`
    }
  }
  if (document.documentElement) mount()
  else document.addEventListener("readystatechange", mount, { once: true })
  document.addEventListener("DOMContentLoaded", mount)
}

export async function installOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(install)
}
