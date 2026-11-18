import { expect, test } from "bun:test"
import { metrics } from "@opentelemetry/api"
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics"
import { recordOrderCreated, resetMetrics } from "../src/lib/metrics"

test("a COD order in TND is counted once, under its currency and country", async () => {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }))
  resetMetrics()

  recordOrderCreated({ method: "cod", currency: "TND", country: "TN" })
  await reader.forceFlush()

  const metric = exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .find((candidate) => candidate.descriptor.name === "ceraghit.orders.created")

  expect(metric?.dataPoints).toHaveLength(1)
  expect(metric?.dataPoints[0]?.value).toBe(1)
  expect(metric?.dataPoints[0]?.attributes).toEqual({ method: "cod", currency: "TND", country: "TN" })
})
