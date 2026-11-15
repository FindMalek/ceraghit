import type { PublicShopProfile } from "@workspace/sdk"

const FALLBACK_NAME = "Ceraghit Creation"

export const clean = (value: string | null | undefined): string | null => value?.trim() || null

export const shopName = (profile: PublicShopProfile): string => clean(profile.displayName) ?? FALLBACK_NAME

/** `address, postalCode city`, skipping whatever the owner left empty. */
export function formatAddress(profile: PublicShopProfile): string | null {
  const place = [clean(profile.postalCode), clean(profile.city)].filter(Boolean).join(" ")
  return [clean(profile.address), place || null].filter(Boolean).join(", ") || null
}
