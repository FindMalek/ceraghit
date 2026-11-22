import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk"],
  // Static catalogue photos are resized per device, see components/photo.tsx.
  images: {
    formats: ["image/webp"],
    // 70 is the product gallery: lighter than the default, no visible banding on glazes.
    qualities: [70, 75],
    // 1000 sits between 828 and 1080: a 412px phone at 2.6x draws 380 css px of gallery photo, i.e. 990 device px.
    deviceSizes: [640, 750, 828, 1000, 1200, 1920, 2048, 3840],
    localPatterns: [{ pathname: "/catalogue/**" }, { pathname: "/api/files/**" }, { pathname: "/logo.webp" }],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ]
  },
  // The OG cards read their fonts from disk, make sure the build ships them.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
}

export default withNextIntl(nextConfig)
