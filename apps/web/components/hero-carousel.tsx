"use client"

import { PauseIcon, PlayIcon } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import Image from "@/components/photo"

const INTERVAL_MS = 5000

/** Crossfades through the photos on its own. Stays still for visitors who prefer reduced motion, and has a pause button. */
export function HeroCarousel({ images }: { images: string[] }) {
  const [active, setActive] = useState(0)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const t = useTranslations("home")

  useEffect(() => {
    setReady(true)
  }, [])

  useEffect(() => {
    if (paused || images.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setActive((i) => (i + 1) % images.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [images.length, paused])

  return (
    <div data-hydrated={ready} className="frame relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-card">
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
      {images.length > 1 && (
        <button
          type="button"
          aria-label={paused ? t("carouselPlay") : t("carouselPause")}
          onClick={() => setPaused((p) => !p)}
          className="absolute end-2 bottom-2 grid size-11 place-items-center bg-background/80 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
        </button>
      )}
    </div>
  )
}
