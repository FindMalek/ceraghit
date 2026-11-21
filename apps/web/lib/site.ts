export const SITE = {
  name: "Ceraghit",
  artist: "Sabri Ghit",
  isProduction: process.env.APP_ENV === "production",
  url: process.env.WEB_URL ?? "http://localhost:3000",
}

export const EDITO_KEYS = ["p1", "p2", "p3", "p4", "p5"] as const
