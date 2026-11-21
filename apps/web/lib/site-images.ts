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
