import { createServerClient } from "@workspace/orpc/server"
import { InvoiceDocument } from "@workspace/ui/brand/invoice-document"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PrintButton } from "@/components/print-button"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function InvoicePage({ params, searchParams }: Props) {
  const [{ number }, { t: token }] = await Promise.all([params, searchParams])
  const view = await createServerClient()
    .public.orders.invoice({ number, token: token ?? "" })
    .catch(() => null)
  if (!view) notFound()
  return (
    <div className="space-y-6 px-4 py-8 print:p-0">
      <div className="mx-auto flex max-w-[210mm] justify-end print:hidden">
        <PrintButton />
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <InvoiceDocument view={view} />
      </div>
    </div>
  )
}
