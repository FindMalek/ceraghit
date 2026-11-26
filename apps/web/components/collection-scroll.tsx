"use client"

import { type ComponentProps, type ReactNode, useEffect, useRef } from "react"
import { Link } from "@/i18n/navigation"

let picked = false

/** A collection tile: remembers the tap so the collection page can scroll past the tiles. */
export function CollectionLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={() => {
        // tapping the current tile keeps the page mounted, so nothing would consume the flag
        picked = props["aria-current"] !== "page"
      }}
    />
  )
}

/** On phones the tiles fill the screen, so a collection chosen from a tile scrolls to its pieces. */
export function CollectionResults({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!picked) return
    // after the router's own scroll to the top of the new page
    const frame = requestAnimationFrame(() => {
      picked = false
      if (!window.matchMedia("(max-width: 639px)").matches) return
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ref.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div ref={ref} className="scroll-mt-20 space-y-8">
      {children}
    </div>
  )
}
