import { DEFAULT_SITE_IMAGES, DEFAULT_SITE_SIZES } from "@workspace/sdk"

export const SITE = {
  name: "Ceraghit",
  artist: "Sabri Ghit",
  isProduction: process.env.APP_ENV === "production",
  url: process.env.WEB_URL ?? "http://localhost:3000",
}

export const EDITO_KEYS = ["p1", "p2", "p3", "p4", "p5"] as const

export const STUDIO_PHOTOS = DEFAULT_SITE_IMAGES.studio.map((src) => ({
  src,
  w: DEFAULT_SITE_SIZES[src]!.width,
  h: DEFAULT_SITE_SIZES[src]!.height,
}))

export const HERO_PHOTOS = DEFAULT_SITE_IMAGES.hero

export const PROCESS_PHOTOS = DEFAULT_SITE_IMAGES.process
