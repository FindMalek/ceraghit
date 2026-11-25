import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { AggregationTemporalityPreference, OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { waitUntil } from "@vercel/functions"
import { type openObserve, resourceAttributes } from "@workspace/logger/openobserve"
import { shipLogsToOtel } from "@workspace/logger/otel"
import type { Telemetry } from "./telemetry"

/**
 * Starts one OTLP pipeline for traces, logs and metrics, tagged `ceraghit-api` and the deploy environment. NodeSDK
 * runs unchanged under Bun (spike recorded in the PR): only HTTP exporters and no auto-instrumentation, so a cold
 * start pays for three exporters and nothing else. The processors are kept here because `NodeSDK` exposes no
 * `forceFlush`, and Vercel freezes the instance the moment the response is sent.
 */
export function startSdk(config: NonNullable<ReturnType<typeof openObserve>>): Telemetry {
  const spans = new BatchSpanProcessor(new OTLPTraceExporter({ url: config.traces, headers: config.headers }))
  const records = new BatchLogRecordProcessor(new OTLPLogExporter({ url: config.logs, headers: config.logHeaders }))
  const metrics = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: config.metrics,
      headers: config.headers,
      // Vercel scales to zero: a counter is exported once and forgotten, never carried by the next instance.
      temporalityPreference: AggregationTemporalityPreference.DELTA,
    }),
    exportIntervalMillis: 60_000,
  })

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttributes(config)),
    spanProcessors: [spans],
    logRecordProcessors: [records],
    metricReaders: [metrics],
  })
  sdk.start()
  shipLogsToOtel(config.service)

  return {
    enabled: true,
    waitUntil,
    forceFlush: async () => {
      await Promise.all([spans.forceFlush(), records.forceFlush(), metrics.forceFlush()]).catch(() => {})
    },
    shutdown: () => sdk.shutdown(),
  }
}
