import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

/** Public host of the bucket (R2 custom domain): set where the build runs, empty on the homelab (signed urls). */
const filesUrl = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL) : null

if (filesUrl && filesUrl.protocol !== "https:")
  console.warn(`[next.config] S3_PUBLIC_URL is not https (${filesUrl.origin}), uploaded photos will be fetched over it`)
if (filesUrl) console.info(`[next.config] uploaded photos are optimised from ${filesUrl.origin}`)

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk"],
  env: { NEXT_PUBLIC_FILES_URL: filesUrl?.origin ?? "" },
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
