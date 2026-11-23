import type { NextConfig } from "next"

const release = process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk", "@workspace/errors", "@workspace/logger"],
  // The browser reports to GlitchTip only when NEXT_PUBLIC_GLITCHTIP_DSN is set at build time; the release is the commit.
  env: {
    ...(release ? { NEXT_PUBLIC_GLITCHTIP_RELEASE: release } : {}),
  },
  images: { unoptimized: true },
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
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
  },
}

export default nextConfig
