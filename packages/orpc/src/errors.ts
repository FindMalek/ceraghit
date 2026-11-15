import { ORPCError } from "@orpc/client"
import type { PublicErrorReason } from "@workspace/sdk"

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "UNAUTHORIZED"
}

/** A guest-facing error: the english message stays for logs and api clients, `data.reason` lets the storefront translate it. */
export function publicError(
  code: ConstructorParameters<typeof ORPCError>[0],
  reason: PublicErrorReason,
  message: string,
) {
  return new ORPCError(code, { message, data: { reason } })
}
