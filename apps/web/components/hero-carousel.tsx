"use client"

import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import { useEffect, useState } from "react"

const INTERVAL_MS = 5000

/** Crossfades through the photos on its own. Stays still for visitors who prefer reduced motion. */
export function HeroCarousel({ images }: { images: string[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (images.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setActive((i) => (i + 1) % images.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <div className="frame relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-card">
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={i === 0}
          sizes="(min-width: 768px) 28rem, 100vw"
          className={cn("object-cover transition-opacity duration-1000", i === active ? "opacity-100" : "opacity-0")}
        />
      ))}
    </div>
  )
}
