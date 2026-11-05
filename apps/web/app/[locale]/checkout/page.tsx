import { getTranslations } from "next-intl/server"
import { CheckoutForm } from "@/components/checkout-form"
import { getSettings } from "@/lib/api"

export async function generateMetadata() {
  return { title: (await getTranslations("checkout"))("title"), robots: { index: false } }
}

export default async function Checkout() {
  const t = await getTranslations("checkout")
  const { onlinePayments } = await getSettings()
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <h1 className="text-5xl md:text-6xl">{t("title")}</h1>
      <CheckoutForm onlinePayments={onlinePayments} />
    </div>
  )
}
