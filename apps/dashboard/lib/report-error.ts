/** Sends a render error caught by an error boundary to GlitchTip. A no-op unless the build has a client DSN. */
export function reportClientError(error: unknown): void {
  if (process.env.NEXT_PUBLIC_GLITCHTIP_DSN) {
    void import("@workspace/errors/browser").then(({ captureBrowserError }) => captureBrowserError(error))
  }
}
