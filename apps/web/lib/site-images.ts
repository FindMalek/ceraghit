import {
  DEFAULT_SITE_IMAGES,
  DEFAULT_SITE_SIZES,
  imageSrc,
  type PublicSiteImages,
  pick,
  type SiteSlot,
} from "@workspace/sdk"

export interface SiteImage {
  src: string
  alt: string
  width: number | null
  height: number | null
}

/** The 36px medallion of the header and footer: the bundled logo has a 112px copy (4 KB instead of 29 KB). */
export function medallionSrc(data: Partial<PublicSiteImages>, locale: string): string | undefined {
  const src = siteImages("logo", data, locale)[0]?.src
  return src === "/logo.webp" ? "/logo-sm.webp" : src
}

/** The slot's pictures in order, alt picked for the locale. A missing slot (api down) falls back to the bundled pictures. */
export function siteImages(slot: SiteSlot, data: Partial<PublicSiteImages>, locale: string): SiteImage[] {
  const entries = data[slot]
  if (!entries)
    return DEFAULT_SITE_IMAGES[slot].map((image) => ({
      src: imageSrc(image),
      alt: "",
      width: DEFAULT_SITE_SIZES[image]?.width ?? null,
      height: DEFAULT_SITE_SIZES[image]?.height ?? null,
    }))
  return entries.map((e) => ({ src: imageSrc(e.image), alt: pick(e.alt, locale), width: e.width, height: e.height }))
}
