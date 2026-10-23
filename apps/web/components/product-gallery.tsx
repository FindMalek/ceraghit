"use client"

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import { imageSrc } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { type KeyboardEvent, type TouchEvent, useRef, useState } from "react"

interface GalleryImage {
  id: string
  image: string
  alt: string | null
}

export function ProductGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const t = useTranslations("product")
  /** In right-to-left languages "next" is on the left: arrows and swipes flip. */
  const step = useLocale() === "ar" ? -1 : 1
  const [index, setIndex] = useState(0)
  const touchStart = useRef<number | null>(null)
  const count = images.length
  const go = (to: number) => setIndex((to + count) % count)

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
    >
      <div
        className="frame relative aspect-square touch-pan-y overflow-hidden bg-card"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={onTouchEnd}
      >
        {images.map((img, i) => (
          <Image
            key={img.id}
            src={imageSrc(img.image)}
            alt={img.alt ?? `${title} ${i + 1}`}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority={i === 0}
            aria-hidden={i !== index}
            className={cn("object-cover transition-opacity duration-300", i === index ? "opacity-100" : "opacity-0")}
          />
        ))}
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
                <Image src={imageSrc(img.image)} alt="" fill sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
