import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/** A query past this takes long enough to show up in a trace and to be worth a line of its own. */
export const SLOW_QUERY_MS = 500

export interface SlowQuery {
  /** The statement as drizzle sent it, `$1` placeholders included: no customer value ever reaches the log. */
  query: string
  ms: number
}

type Client = ReturnType<typeof postgres>
type Options = { onSlowQuery?: (slow: SlowQuery) => void }

/**
 * Every drizzle query goes through `client.unsafe(...)`, which returns a thenable. Wrapping that thenable is the only
 * way to time a query with postgres.js: nothing else sees the moment the row comes back.
 */
function measured(result: unknown, query: string, started: number, onSlow?: (slow: SlowQuery) => void): unknown {
  if (!onSlow || !result || typeof (result as { then?: unknown }).then !== "function") return result
  let settled = false
  const done = () => {
    if (settled) return
    settled = true
    const ms = performance.now() - started
    if (ms >= SLOW_QUERY_MS) onSlow({ query, ms: Math.round(ms) })
  }
  const awaited = (value: unknown) => {
    if (value && typeof (value as Promise<unknown>).then === "function") {
      return (value as Promise<unknown>).then(
        (rows) => {
          done()
          return rows
        },
        (error) => {
          done()
          throw error
        },
      )
    }
    done()
    return value
  }
  if (typeof result !== "object") return result
  return new Proxy(result, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof value !== "function") return value
      return (...args: unknown[]) => awaited(value.apply(target, args))
    },
  })
}

function timedClient(client: Client, onSlow: (slow: SlowQuery) => void): Client {
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === "unsafe") {
        return (query: string, params?: unknown[], options?: unknown) => {
          const started = performance.now()
          return measured(value.call(target, query, params, options), query, started, onSlow)
        }
      }
      if (property === "begin") {
        return (run: (tx: Client) => unknown, options?: unknown) =>
          value.call(target, (tx: Client) => run(timedClient(tx, onSlow)), options)
      }
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

export function createDb(url: string, max = 10, options: Options = {}) {
  const client = postgres(url, { max, onnotice: () => {} })
  const timed = options.onSlowQuery ? timedClient(client, options.onSlowQuery) : client
  return Object.assign(drizzle(timed, { schema }), { close: () => client.end() })
}

export type Db = ReturnType<typeof createDb>
export * from "./demo-ref"
export * from "./schema"
