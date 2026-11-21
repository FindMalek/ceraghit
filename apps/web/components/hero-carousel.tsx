"use client"

import { PauseIcon, PlayIcon } from "@phosphor-icons/react"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import Image from "@/components/photo"
import type { SiteImage } from "@/lib/site-images"

const INTERVAL_MS = 5000

/** Crossfades through the photos on its own. Stays still for visitors who prefer reduced motion, and has a pause button. */
export function HeroCarousel({ slides }: { slides: SiteImage[] }) {
  const [active, setActive] = useState(0)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reduced, setReduced] = useState(false)
  const t = useTranslations("home")

  useEffect(() => {
    setReady(true)
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onMotion = () => setReduced(query.matches)
    const onVisibility = () => setHidden(document.hidden)
    onMotion()
    query.addEventListener("change", onMotion)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      query.removeEventListener("change", onMotion)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const count = slides.length
  useEffect(() => {
    if (paused || hovered || hidden || reduced || count < 2) return
    const timer = setInterval(() => setActive((i) => (i + 1) % count), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [count, paused, hovered, hidden, reduced])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the timer
    <div
      data-hydrated={ready}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="frame relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-card"
    >
      {slides.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          aria-hidden={i !== active}
          fill
          priority={i === 0}
          loading={i === 0 ? undefined : "lazy"}
          sizes="(min-width: 768px) 28rem, 100vw"
          className={cn("object-cover transition-opacity duration-1000", i === active ? "opacity-100" : "opacity-0")}
        />
      ))}
      {count > 1 && (
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
