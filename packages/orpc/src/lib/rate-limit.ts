/** In-memory sliding window per key. Good enough to slow abuse of one endpoint on one instance. */
export class RateLimit {
  private hits = new Map<string, number[]>()

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Records a hit and says whether it is allowed. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.hits.clear()
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    this.hits.set(key, [...recent, now])
    return true
  }
}

export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local"
}
