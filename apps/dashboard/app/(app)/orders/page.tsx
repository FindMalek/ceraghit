import type { Metadata } from "next"
import { OrdersView } from "@/components/orders-view"

export const metadata: Metadata = { title: "Commandes" }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  return <OrdersView initialQuery={q?.slice(0, 40) ?? ""} />
}
