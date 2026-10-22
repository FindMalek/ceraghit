import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { OrderStatus } from "@/components/order-status"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params
  return { title: (await getTranslations("order"))("title", { number }), robots: { index: false } }
}

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, { t: token }, t] = await Promise.all([params, searchParams, getTranslations("order")])
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <h1 className="text-center text-5xl">{t("title", { number })}</h1>
      <OrderStatus number={number} token={token ?? ""} />
    </div>
  )
}
