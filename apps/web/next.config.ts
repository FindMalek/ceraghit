import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const release = process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA

/** Public host of the bucket (R2 custom domain): set where the build runs, empty on the homelab (signed urls). */
const filesUrl = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL) : null

if (filesUrl && filesUrl.protocol !== "https:")
  console.warn(`[next.config] S3_PUBLIC_URL is not https (${filesUrl.origin}), uploaded photos will be fetched over it`)
if (filesUrl) console.info(`[next.config] uploaded photos are optimised from ${filesUrl.origin}`)

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk", "@workspace/errors", "@workspace/logger"],
  // The browser reports to GlitchTip only when NEXT_PUBLIC_GLITCHTIP_DSN is set at build time; the release is the commit.
  env: {
    NEXT_PUBLIC_FILES_URL: filesUrl?.origin ?? "",
    ...(release ? { NEXT_PUBLIC_GLITCHTIP_RELEASE: release } : {}),
  },
  // Catalogue photos and uploads from the public bucket host are resized per device, see components/photo.tsx.
  images: {
    formats: ["image/webp"],
    remotePatterns: filesUrl
      ? [
          {
            protocol: filesUrl.protocol === "http:" ? "http" : "https",
            hostname: filesUrl.hostname,
            port: filesUrl.port,
            pathname: "/**",
          },
        ]
      : [],
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
