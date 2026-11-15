import { isPublicErrorReason } from "@workspace/sdk"
import { useTranslations } from "next-intl"

export function errorReason(error: unknown) {
  const data = typeof error === "object" && error !== null && "data" in error ? error.data : null
  const reason = typeof data === "object" && data !== null && "reason" in data ? data.reason : null
  return isPublicErrorReason(reason) ? reason : null
}

/** The visitor's language for an api error; network failures and unknown errors get `fallback`. */
export function useApiErrorMessage() {
  const t = useTranslations("errors.api")
  return (error: unknown, fallback: string) => {
    const reason = errorReason(error)
    return reason ? t(reason) : fallback
  }
}
