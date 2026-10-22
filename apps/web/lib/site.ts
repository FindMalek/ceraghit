export const SITE = {
  name: "Ceraghit",
  artist: "Sabri Ghit",
  isProduction: process.env.APP_ENV === "production",
  url: process.env.WEB_URL ?? "http://localhost:3000",
}

export const EDITO_KEYS = ["p1", "p2", "p3", "p4", "p5"] as const

export const STUDIO_PHOTOS = [
  { src: "/catalogue/studio-interior.webp", w: 1079, h: 1560 },
  { src: "/catalogue/studio-masks.webp", w: 662, h: 956 },
  { src: "/catalogue/studio-lamps.webp", w: 680, h: 984 },
]

export const PROCESS_PHOTOS = [1, 2, 3, 4].map((n) => `/catalogue/process-${n}.webp`)
