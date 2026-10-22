import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ShippingEstimator } from "@/components/shipping-estimator"

export const metadata: Metadata = { title: "Estimateur de livraison" }

export default function ShippingPage() {
  return (
    <>
      <PageHeader
        title="Estimateur de livraison"
        description="Ce que vos clients paieront pour recevoir une commande."
      />
      <ShippingEstimator />
    </>
  )
}
