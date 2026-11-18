import "server-only"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerOTel } from "@vercel/otel"
import { registerLogger } from "@workspace/logger/next"
import { resourceAttributes } from "@workspace/logger/openobserve"
import { logProcessor, shipLogsToOtel } from "@workspace/logger/otel"

/**
 * Traces and logs of the dashboard, sent to OpenObserve under `service`. Without the five variables nothing is
 * registered: no exporter, no buffered span, no socket. Called once from `instrumentation.ts`, node runtime only.
 */
export function startServerTelemetry(service: string): void {
  const environment = process.env.DEPLOY_ENV ?? process.env.APP_ENV ?? "local"
  const config = registerLogger({ service, environment, level: process.env.LOG_LEVEL })
  if (!config) return
  registerOTel({
    serviceName: service,
    attributes: resourceAttributes(config),
    traceExporter: new OTLPTraceExporter({ url: config.traces, headers: config.headers }),
    logRecordProcessors: [logProcessor(config)],
  })
  shipLogsToOtel(service)
}
