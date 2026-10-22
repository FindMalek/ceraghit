"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { recallOrderToken } from "@/lib/order-tokens"

export function DemoGateway({ orderNumber, paymentRef }: { orderNumber: string; paymentRef: string }) {
  const t = useTranslations("demo")
  const router = useRouter()
  const resolve = useMutation(
    orpc.public.orders.demoResolve.mutationOptions({
      onSuccess: () => {
        const token = recallOrderToken(orderNumber)
        if (!token) return toast.error(t("noToken"))
        router.push(`/order/${orderNumber}?t=${encodeURIComponent(token)}`)
      },
      onError: () => toast.error(t("failedToResolve")),
    }),
  )
  return (
    <div className="frame mx-auto max-w-md space-y-5 bg-card/70 p-8 text-center">
      <h1 className="text-4xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("text", { order: orderNumber })}</p>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="h-12"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ ref: paymentRef, outcome: "paid" })}
        >
          {t("pay")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ ref: paymentRef, outcome: "failed" })}
        >
          {t("fail")}
        </Button>
      </div>
    </div>
  )
}
