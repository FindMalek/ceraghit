/**
 * Browser error reporting to GlitchTip. The `NEXT_PUBLIC_*` values are inlined at build time, so without a DSN this
 * file compiles to nothing and the SDK never reaches the bundle.
 */
if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
  void import("@workspace/errors/browser").then(({ initBrowser }) =>
    initBrowser({
      dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
      environment: process.env.NEXT_PUBLIC_GLITCHTIP_ENV,
      release: process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE,
    }),
  )
}
