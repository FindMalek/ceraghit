import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@workspace/ui", "@workspace/sdk"],
  images: { unoptimized: true },
  poweredByHeader: false,
}

export default nextConfig
