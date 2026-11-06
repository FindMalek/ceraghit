import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk"],
  images: { unoptimized: true },
  poweredByHeader: false,
  // The OG cards read their fonts from disk, make sure the build ships them.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
}

export default withNextIntl(nextConfig)
