import { AsyncLocalStorage } from "node:async_hooks"
import { trace } from "@opentelemetry/api"
import { redact } from "./redact"

export { REDACTED, redact } from "./redact"

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export type Fields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: Fields): void
  info(message: string, fields?: Fields): void
  warn(message: string, fields?: Fields): void
  error(message: string, fields?: Fields): void
  child(bindings: Fields): Logger
}

export interface LoggerOptions {
  level?: LogLevel
  /** One colored line per entry instead of json. */
  pretty?: boolean
  /** Extra fields on every line, e.g. `service` and `env`. */
  mixin?: () => Fields
  write?: (line: string) => void
}

const requestIds = new AsyncLocalStorage<string>()

/** Everything logged inside `fn` carries this request id, however deep the call goes. */
export const withRequestId = <T>(id: string, fn: () => T): T => requestIds.run(id, fn)
export const getRequestId = (): string | undefined => requestIds.getStore()

/** Accepts an inbound `x-request-id` only when it is short and plain, otherwise mints a new one. */
export function resolveRequestId(inbound: string | null | undefined): string {
  return inbound && /^[A-Za-z0-9-]{8,64}$/.test(inbound) ? inbound : crypto.randomUUID()
}

/** A trace id and span id from whatever tracer is running, so a log line always finds its trace. */
export function traceFields(): Fields {
  const context = trace.getActiveSpan()?.spanContext()
  return context ? { trace_id: context.traceId, span_id: context.spanId } : {}
}

const COLORS: Record<LogLevel, string> = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" }
const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export const parseLevel = (value: string | undefined): LogLevel =>
  LOG_LEVELS.find((level) => level === value?.toLowerCase()) ?? "info"

export interface Record_ {
  level: LogLevel
  message: string
  time: string
  fields: Fields
}

type Sink = (record: Record_) => void
let sink: Sink | null = null

/** Ships every accepted line somewhere else too (the OTLP log exporter, when OpenObserve is configured). */
export function setLogSink(next: Sink | null): void {
  sink = next
}

interface State {
  level: LogLevel
  pretty: boolean
  mixin: () => Fields
  write: (line: string) => void
}

function emit(state: State, level: LogLevel, message: string, bindings: Fields, fields: Fields | undefined) {
  if (RANK[level] < RANK[state.level]) return
  const requestId = getRequestId()
  const entry = redact({
    ...state.mixin(),
    ...bindings,
    ...traceFields(),
    ...(requestId ? { request_id: requestId } : {}),
    ...fields,
  }) as Fields
  const time = new Date().toISOString()
  if (!state.pretty) {
    state.write(JSON.stringify({ level, time, msg: message, ...entry }))
  } else {
    const rest = Object.keys(entry).length ? ` ${JSON.stringify(entry)}` : ""
    state.write(`${COLORS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${message}${rest}`)
  }
  sink?.({ level, message, time, fields: entry })
}

function build(state: State, bindings: Fields): Logger {
  const log = (level: LogLevel) => (message: string, fields?: Fields) => emit(state, level, message, bindings, fields)
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (extra) => build(state, { ...bindings, ...extra }),
  }
}

type ConfigurableLogger = Logger & { configure(options: LoggerOptions): void }

/** A logger whose level, format and mixin can change after children were handed out (the env loads later). */
export function createLogger(options: LoggerOptions = {}): ConfigurableLogger {
  const state: State = {
    level: options.level ?? parseLevel(process.env.LOG_LEVEL),
    pretty: options.pretty ?? process.env.NODE_ENV !== "production",
    mixin: options.mixin ?? (() => ({})),
    write: options.write ?? ((line) => process.stdout.write(`${line}\n`)),
  }
  return {
    ...build(state, {}),
    configure: (next) => {
      if (next.level) state.level = next.level
      if (next.pretty !== undefined) state.pretty = next.pretty
      if (next.mixin) state.mixin = next.mixin
    },
  }
}

/** Shared by the whole process. Call `logger.configure({ level, pretty, mixin })` once the env is loaded. */
export const logger = createLogger()

const CONSOLE_LEVELS = { debug: "debug", log: "info", info: "info", warn: "warn", error: "error" } as const

/** Sends `console.*` through the logger so libraries and older code get the same json, redaction and request id. */
export function patchConsole(target: Logger = logger): void {
  for (const [method, level] of Object.entries(CONSOLE_LEVELS)) {
    console[method as keyof typeof CONSOLE_LEVELS] = (...args: unknown[]) => {
      const [first, ...rest] = args
      const message = typeof first === "string" ? first : first instanceof Error ? first.message : "log"
      const extras = typeof first === "string" ? rest : [first, ...rest]
      const fields: Fields = {}
      const error = extras.find((item): item is Error => item instanceof Error)
      if (error) fields.err = error
      const data = extras.filter((item) => !(item instanceof Error))
      if (data.length) fields.data = data.length === 1 ? data[0] : data
      target[level](message, fields)
    }
  }
}
