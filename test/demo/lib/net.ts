import type { BrowserContext } from "@playwright/test"

export type NetworkRule =
  | { kind: "reset" }
  | { kind: "slow"; ms: number; pattern: string }
  | { kind: "fail"; pattern: string }
  | { kind: "status"; code: number; pattern: string }

const MAX_SLOW_MS = 30_000

/**
 * The `value` of a `network` step, to film loading skeletons and error pages:
 * `slow 4000 **\/api/admin/**` delays matching requests, `fail **\/api/**` drops them, `status 500 **\/api/**`
 * answers an error, `reset` removes every rule. The pattern is a Playwright glob and must start with `**\/`.
 */
export function parseNetwork(value: string | undefined): NetworkRule {
  const parts = (value ?? "").trim().split(/\s+/)
  const [kind, ...rest] = parts
  if (kind === "reset" && rest.length === 0) return { kind: "reset" }
  const pattern = (glob: string | undefined): string => {
    if (!glob?.startsWith("**/") || glob.length < 5) {
      throw new Error(`a network pattern must start with "**/" and name a path, got "${glob ?? ""}"`)
    }
    return glob
  }
  if (kind === "fail" && rest.length === 1) return { kind: "fail", pattern: pattern(rest[0]) }
  if (kind === "slow" && rest.length === 2) {
    const ms = Number(rest[0])
    if (!Number.isInteger(ms) || ms < 1 || ms > MAX_SLOW_MS) throw new Error(`slow takes 1 to ${MAX_SLOW_MS} ms`)
    return { kind: "slow", ms, pattern: pattern(rest[1]) }
  }
  if (kind === "status" && rest.length === 2) {
    const code = Number(rest[0])
    if (!Number.isInteger(code) || code < 400 || code > 599) throw new Error("status takes a code from 400 to 599")
    return { kind: "status", code, pattern: pattern(rest[1]) }
  }
  throw new Error(
    `unknown network rule "${value ?? ""}": use slow <ms> <glob>, fail <glob>, status <code> <glob> or reset`,
  )
}

export async function applyNetwork(context: BrowserContext, rule: NetworkRule): Promise<void> {
  switch (rule.kind) {
    case "reset":
      await context.unrouteAll({ behavior: "ignoreErrors" })
      break
    case "slow":
      await context.route(rule.pattern, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, rule.ms))
        await route.continue().catch(() => {})
      })
      break
    case "fail":
      await context.route(rule.pattern, (route) => route.abort("connectionrefused").catch(() => {}))
      break
    case "status":
      await context.route(rule.pattern, (route) =>
        route
          .fulfill({
            status: rule.code,
            contentType: "application/json",
            body: JSON.stringify({
              defined: false,
              code: "INTERNAL_SERVER_ERROR",
              status: rule.code,
              message: "Erreur",
            }),
          })
          .catch(() => {}),
      )
      break
  }
}
