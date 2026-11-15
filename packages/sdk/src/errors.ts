export const PUBLIC_ERROR_REASONS = [
  "payment_method_unavailable",
  "piece_not_found",
  "piece_unavailable",
  "piece_quote_only",
  "piece_unique",
  "option_unavailable",
  "option_required",
  "out_of_stock",
  "order_too_big",
  "order_failed",
  "order_not_found",
  "payment_not_found",
  "payment_service_down",
  "photos_unavailable",
  "too_many_uploads",
  "photo_missing",
  "storage_full",
] as const

export type PublicErrorReason = (typeof PUBLIC_ERROR_REASONS)[number]

export function isPublicErrorReason(value: unknown): value is PublicErrorReason {
  return PUBLIC_ERROR_REASONS.some((reason) => reason === value)
}
