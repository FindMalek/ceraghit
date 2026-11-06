import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk"],
  // Static catalogue photos are resized per device, see components/photo.tsx.
  images: { formats: ["image/webp"], localPatterns: [{ pathname: "/catalogue/**" }, { pathname: "/api/files/**" }] },
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
