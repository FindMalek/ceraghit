/** Drops the storefront's cached reads. Never fails the write: the cache expires on its own anyway. */
export function storefrontRevalidator(webUrl: string, secret: string | undefined) {
  if (!secret) return undefined
  const url = new URL("/api/revalidate", webUrl)
  return async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) console.error("[revalidate]", res.status)
    } catch (error) {
      console.error("[revalidate]", error instanceof Error ? error.message : "failed")
    }
  }
}
