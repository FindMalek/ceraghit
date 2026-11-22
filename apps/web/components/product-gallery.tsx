"use client"

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import { imageSrc, type ProductImage, pick } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { type KeyboardEvent, type TouchEvent, useEffect, useRef, useState } from "react"
import Image from "@/components/photo"

/** Page gutters and the two-column grid of the product page, so a phone asks for the width it really draws. */
const MAIN_SIZES = "(min-width: 1280px) 37rem, (min-width: 768px) calc(50vw - 3rem), calc(100vw - 2rem)"

export function ProductGallery({ images, title }: { images: ProductImage[]; title: string }) {
  const t = useTranslations("product")
  /** In right-to-left languages "next" is on the left: arrows and swipes flip. */
  const locale = useLocale()
  const step = locale === "ar" ? -1 : 1
  const [index, setIndex] = useState(0)
  /** Only the first photo loads with the page; the rest follow once it is on screen (or the visitor moves), so they never compete with the LCP photo. */
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), 2500)
    return () => clearTimeout(timer)
  }, [])
  const touchStart = useRef<number | null>(null)
  const count = images.length
  const go = (to: number) => {
    setWarm(true)
    setIndex((to + count) % count)
  }

  if (count === 0) return <div className="frame aspect-square bg-card" />

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") go(index - step)
    if (event.key === "ArrowRight") go(index + step)
  }
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (start === null) return
    const delta = (event.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) > 40) go(index + step * (delta < 0 ? 1 : -1))
  }

  return (
    <div
      className="space-y-3"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("gallery")}
      onKeyDown={onKey}
      onPointerEnter={() => setWarm(true)}
      onFocus={() => setWarm(true)}
    >
      <div
        className="frame relative aspect-square touch-pan-y overflow-hidden bg-card"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={onTouchEnd}
      >
        {images.map((img, i) =>
          i === 0 || warm ? (
            <Image
              key={img.id}
              src={imageSrc(img.image)}
              alt={pick(img.alt, locale) || `${title} ${i + 1}`}
              fill
              sizes={MAIN_SIZES}
              priority={i === 0}
              fetchPriority={i === 0 ? "high" : "low"}
              quality={70}
              onLoad={i === 0 ? () => setWarm(true) : undefined}
              aria-hidden={i !== index}
              className={cn("object-cover transition-opacity duration-300", i === index ? "opacity-100" : "opacity-0")}
            />
          ) : null,
        )}
        {count > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="absolute start-2 top-1/2 size-11 -translate-y-1/2 bg-background/70 backdrop-blur"
              aria-label={t("previous")}
              onClick={() => go(index - 1)}
            >
              <CaretLeftIcon className="rtl:rotate-180" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute end-2 top-1/2 size-11 -translate-y-1/2 bg-background/70 backdrop-blur"
              aria-label={t("next")}
              onClick={() => go(index + 1)}
            >
              <CaretRightIcon className="rtl:rotate-180" />
            </Button>
            <p className="sr-only" aria-live="polite">
              {t("photo", { n: index + 1, total: count })}
            </p>
          </>
        )}
      </div>
      {count > 1 && (
        <ul className="grid grid-cols-4 gap-3">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                aria-label={t("photo", { n: i + 1, total: count })}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "frame relative block aspect-square w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === index ? "opacity-100 ring-1 ring-primary" : "opacity-60 hover:opacity-100",
                )}
              >
                {warm && <Image src={imageSrc(img.image)} alt="" fill sizes="120px" className="object-cover" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
