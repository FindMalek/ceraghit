import type { Page } from "@playwright/test"

export interface LayoutProblem {
  kind: "overflow" | "outside" | "clipped"
  where: string
  text: string
}

/**
 * Looks for what a visitor would see as broken: the page scrolling sideways, a visible element sticking out of the
 * viewport, text cut off by its own box. Elements inside a scroller or a clipping box are the box's business, and
 * `data-allow-clip` marks a clip that is on purpose.
 */
export async function layoutProblems(page: Page): Promise<LayoutProblem[]> {
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate((): LayoutProblem[] => {
    const found: LayoutProblem[] = []
    const root = document.documentElement
    const label = (el: Element): string => {
      const id = el.id ? `#${el.id}` : ""
      const cls =
        typeof el.className === "string" && el.className ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}` : ""
      return `${el.tagName.toLowerCase()}${id}${cls}`
    }
    if (root.scrollWidth > window.innerWidth + 1)
      found.push({ kind: "overflow", where: "html", text: `scrollWidth ${root.scrollWidth} > ${window.innerWidth}` })

    const clippedByAncestor = (el: Element): boolean => {
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (style.position === "fixed") return false
        if (style.overflowX !== "visible") return true
      }
      return false
    }

    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("[data-allow-clip], svg, [aria-hidden='true']")) continue
      const style = getComputedStyle(el)
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 1 || rect.height <= 1) continue
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? "")
        .join(" ")
        .trim()

      if (
        !clippedByAncestor(el) &&
        (rect.right > window.innerWidth + 1 || rect.left < -1) &&
        style.position !== "fixed"
      )
        found.push({
          kind: "outside",
          where: label(el),
          text: ownText.slice(0, 60) || `${Math.round(rect.left)}..${Math.round(rect.right)}`,
        })

      const clips = ["hidden", "clip"].includes(style.overflowX) || ["hidden", "clip"].includes(style.overflowY)
      if (ownText && clips && style.textOverflow !== "ellipsis") {
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
          found.push({ kind: "clipped", where: label(el), text: ownText.slice(0, 60) })
      }
    }
    return found
  })
}
