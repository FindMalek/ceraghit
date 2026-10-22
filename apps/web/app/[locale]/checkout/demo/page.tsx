import { getTranslations } from "next-intl/server"
import { DemoGateway } from "@/components/demo-gateway"

export const dynamic = "force-dynamic"

export default async function DemoCheckout({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; order?: string }>
}) {
  const [{ ref, order }, t] = await Promise.all([searchParams, getTranslations("demo")])
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      {ref && order ? (
        <DemoGateway orderNumber={order} paymentRef={ref} />
      ) : (
        <p className="text-center text-muted-foreground">{t("noOrder")}</p>
      )}
    </div>
  )
}
