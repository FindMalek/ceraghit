"use client"

import type { ShopProfile } from "@workspace/sdk"
import { useRouter } from "next/navigation"
import { BankSection } from "@/components/profile/bank-section"
import { OwnerSection } from "@/components/profile/owner-section"
import { ShopSection } from "@/components/profile/shop-section"

/** The three sections one under the other; saving refreshes the server data (sidebar name included). */
export function ProfileSections({ owner, shop }: { owner: { name: string }; shop: ShopProfile }) {
  const router = useRouter()
  const refresh = () => router.refresh()
  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
      <OwnerSection initial={owner} onSaved={refresh} />
      <ShopSection initial={shop} onSaved={refresh} />
      <BankSection initial={shop} onSaved={refresh} />
    </div>
  )
}
