"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"

/** Mounts its children once it is near the viewport: Chrome's own lazy loading looks far ahead on slow networks. */
export function InView({ children, margin = "300px" }: { children: ReactNode; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [margin])
  return (
    <div ref={ref} className="absolute inset-0">
      {near ? children : null}
    </div>
  )
}
