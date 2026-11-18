import { type Attributes, context } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { BatchLogRecordProcessor, type LogRecordProcessor } from "@opentelemetry/sdk-logs"
import { type LogLevel, setLogSink } from "./index"
import type { OpenObserve } from "./openobserve"

const SEVERITY: Record<LogLevel, { number: SeverityNumber; text: string }> = {
  debug: { number: SeverityNumber.DEBUG, text: "DEBUG" },
  info: { number: SeverityNumber.INFO, text: "INFO" },
  warn: { number: SeverityNumber.WARN, text: "WARN" },
  error: { number: SeverityNumber.ERROR, text: "ERROR" },
}

/** Batched OTLP log exporter, handed to whichever SDK owns the logger provider (`NodeSDK` in the api, `@vercel/otel` in Next). */
export function logProcessor(config: OpenObserve): LogRecordProcessor {
  return new BatchLogRecordProcessor(new OTLPLogExporter({ url: config.logs, headers: config.logHeaders }))
}

/**
 * Sends every accepted log line through the global OTLP log pipeline, keeping the json on stdout. The trace id and the
 * request id are already fields of the line, so a log record and its span find each other in both directions.
 */
export function shipLogsToOtel(service: string): void {
  const otel = logs.getLogger(service)
  setLogSink(({ level, message, time, fields }) => {
    const severity = SEVERITY[level]
    otel.emit({
      severityNumber: severity.number,
      severityText: severity.text,
      timestamp: new Date(time),
      body: message,
      attributes: fields as Attributes,
      context: context.active(),
    })
  })
}
