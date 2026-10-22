import { getTranslations } from "next-intl/server"
import { CartPage } from "@/components/cart-page"

export async function generateMetadata() {
  return { title: (await getTranslations("cart"))("title") }
}

export default async function Cart() {
  const t = await getTranslations("cart")
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <h1 className="text-5xl md:text-6xl">{t("title")}</h1>
      <CartPage />
    </div>
  )
}
