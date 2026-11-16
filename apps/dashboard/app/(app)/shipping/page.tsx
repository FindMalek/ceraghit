import type { Metadata } from "next"
import { AramexSettingsForm } from "@/components/aramex-settings-form"
import { PageHeader } from "@/components/page-header"
import { ShippingEstimator } from "@/components/shipping-estimator"

export const metadata: Metadata = { title: "Livraison" }

export default function ShippingPage() {
  return (
    <>
      <PageHeader title="Livraison" description="Mode de livraison, identifiants Aramex et tarifs forfaitaires." />
      <AramexSettingsForm />
      <section aria-labelledby="flat-title" className="border-t">
        <h2 id="flat-title" className="px-4 pt-6 font-heading text-2xl md:px-6">
          Tarifs forfaitaires
        </h2>
        <ShippingEstimator />
      </section>
    </>
  )
}
