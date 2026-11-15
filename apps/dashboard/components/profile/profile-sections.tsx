"use client"

import { useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { ShopProfile } from "@workspace/sdk"
import { useRouter } from "next/navigation"
import { BankSection } from "@/components/profile/bank-section"
import { OwnerSection } from "@/components/profile/owner-section"
import { ShopSection } from "@/components/profile/shop-section"

/** The three sections one under the other; saving refreshes the server data (sidebar name included). */
export function ProfileSections({ owner, shop }: { owner: { name: string }; shop: ShopProfile }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const refresh = () => {
    router.refresh()
    queryClient.invalidateQueries({ queryKey: orpc.admin.setup.status.key() })
  }
  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
      <div id="owner" className="scroll-mt-20">
        <OwnerSection initial={owner} onSaved={refresh} />
      </div>
      <div id="profile" className="scroll-mt-20">
        <ShopSection initial={shop} onSaved={refresh} />
      </div>
      <div id="bank" className="scroll-mt-20">
        <BankSection initial={shop} onSaved={refresh} />
      </div>
    </div>
  )
}
