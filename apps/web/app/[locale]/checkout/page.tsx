import { getTranslations } from "next-intl/server"
import { CheckoutForm } from "@/components/checkout-form"

export async function generateMetadata() {
  return { title: (await getTranslations("checkout"))("title") }
}

export default async function Checkout() {
  const t = await getTranslations("checkout")
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <h1 className="text-5xl md:text-6xl">{t("title")}</h1>
      <CheckoutForm />
    </div>
  )
}
