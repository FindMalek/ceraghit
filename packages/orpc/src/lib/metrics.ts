import { type Counter, type Histogram, type Meter, metrics } from "@opentelemetry/api"

/**
 * Business events, one counter per thing the owner asks about. The meter is resolved on every call so a test can
 * register a provider after the module was imported, and nothing here needs a started SDK: without one,
 * `metrics.getMeter` hands out a no-op meter and every call below is free.
 */
export const METER = "ceraghit"

let known: {
  meter: Meter
  counters: Map<string, Counter>
  histograms: Map<string, Histogram>
  gauges: Set<string>
} | null = null

function current() {
  const meter = metrics.getMeter(METER)
  if (!known || known.meter !== meter) known = { meter, counters: new Map(), histograms: new Map(), gauges: new Set() }
  return known
}

function counter(name: string, description: string): Counter {
  const state = current()
  const found = state.counters.get(name)
  if (found) return found
  const made = state.meter.createCounter(name, { description })
  state.counters.set(name, made)
  return made
}

function histogram(name: string, description: string, unit: string): Histogram {
  const state = current()
  const found = state.histograms.get(name)
  if (found) return found
  const made = state.meter.createHistogram(name, { description, unit })
  state.histograms.set(name, made)
  return made
}

export type Currency = string

export function recordOrderCreated(attrs: { method: string; currency: Currency; country: string }): void {
  counter("ceraghit.orders.created", "Orders placed, by payment method and currency").add(1, attrs)
}

export function recordOrderPaid(attrs: { method: string; currency: Currency; source: "gateway" | "manual" }): void {
  counter("ceraghit.orders.paid", "Orders that became paid, by method and source").add(1, attrs)
}

/** Minor units of the order's own currency: never add TND and EUR together, in a dashboard or here. */
export function recordAmountPaid(attrs: { currency: Currency }, amountMinor: number): void {
  counter("ceraghit.orders.amount_paid", "Amounts received in minor units, per currency").add(amountMinor, attrs)
}

export function recordPaymentSettle(result: "paid" | "pending" | "failed" | "mismatch" | "error"): void {
  counter("ceraghit.payments.settle", "Gateway checks and their outcome").add(1, { result })
}

export function recordEmail(kind: string, ok: boolean, locale?: string): void {
  const name = ok ? "ceraghit.emails.sent" : "ceraghit.emails.failed"
  counter(name, "Emails the transport accepted or refused").add(1, { kind, ...(locale ? { locale } : {}) })
}

export function recordCronRun(job: string, result: "ok" | "failed" | "skipped", durationMs: number): void {
  counter("ceraghit.cron.runs", "Scheduled job runs").add(1, { job, result })
  histogram("ceraghit.cron.duration_ms", "How long a scheduled job took", "ms").record(durationMs, { job, result })
}

export function recordUploadsDeleted(files: number): void {
  counter("ceraghit.uploads.deleted", "Unused files removed from the bucket").add(files)
}

let storageBytes = 0

function watchStorage(): void {
  const state = current()
  if (state.gauges.has("ceraghit.storage.bytes")) return
  state.gauges.add("ceraghit.storage.bytes")
  state.meter
    .createObservableGauge("ceraghit.storage.bytes", {
      description: "Bytes used by the photo bucket, measured on the last upload check",
      unit: "By",
    })
    .addCallback((result) => result.observe(storageBytes))
}

/** Last known bucket usage. An observable gauge: the value is read when the reader exports, never per request. */
export function recordStorageBytes(bytes: number): void {
  storageBytes = bytes
  watchStorage()
}

export function recordAiRequest(attrs: { model: string; result: "ok" | "length" | "error" }): void {
  counter("ceraghit.ai.requests", "Translation requests, by model and outcome").add(1, attrs)
}

export function recordAiTokens(attrs: { model: string }, tokens: number): void {
  counter("ceraghit.ai.tokens", "Tokens spent on translation").add(tokens, attrs)
}

export function recordRateLimitBlocked(bucket: "login" | "orders" | "requests"): void {
  counter("ceraghit.ratelimit.blocked", "Requests refused by a rate limit").add(1, { bucket })
}

export function recordHttpRequest(attrs: { route: string; status: number; ms: number }): void {
  histogram("http.server.duration", "Time spent answering a request", "ms").record(attrs.ms, {
    route: attrs.route,
    status_class: `${Math.floor(attrs.status / 100)}xx`,
  })
}

/** Test seam: forget the instruments so the next call resolves the meter again. */
export function resetMetrics(): void {
  known = null
}
