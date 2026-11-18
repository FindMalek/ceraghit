import { type Attributes, type Span, SpanStatusCode, trace } from "@opentelemetry/api"

const tracer = () => trace.getTracer("ceraghit-api")

const message = (error: unknown): string => (error instanceof Error ? error.message : "failed")

/**
 * One span around a call that leaves the process (a provider, the bucket, the model). Manual on purpose: the api runs
 * on Bun, where the auto-instrumentations are not loaded, and five hand-placed spans cover everything it calls.
 */
export async function withSpan<T>(name: string, attributes: Attributes, run: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await run(span)
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: message(error) })
      throw error
    } finally {
      span.end()
    }
  })
}
