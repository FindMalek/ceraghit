import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { PaymentSettingsForm } from "@/components/payment-settings-form"

export const metadata: Metadata = { title: "Paiements" }

export default function PaymentsPage() {
  return (
    <>
      <PageHeader title="Paiements" description="Les moyens de paiement proposés à vos clients." />
      <PaymentSettingsForm />
    </>
  )
}
