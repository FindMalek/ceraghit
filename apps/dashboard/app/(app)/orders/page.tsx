import { shipmentFilterSchema } from "@workspace/sdk"
import type { Metadata } from "next"
import { OrdersView } from "@/components/orders-view"

export const metadata: Metadata = { title: "Commandes" }

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; shipment?: string }>
}) {
  const { q, shipment } = await searchParams
  return (
    <OrdersView initialQuery={q?.slice(0, 40) ?? ""} initialShipment={shipmentFilterSchema.safeParse(shipment).data} />
  )
}
