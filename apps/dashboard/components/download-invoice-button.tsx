"use client"

import { FilePdfIcon } from "@phosphor-icons/react"
import { browserClient } from "@workspace/orpc/react"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Spinner } from "@workspace/ui/components/spinner"
import { useState } from "react"
import { errorMessage } from "@/lib/errors"

/** Fetches the invoice view and renders it to a PDF in the browser. */
export function DownloadInvoiceButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const view = await browserClient.admin.invoices.get({ id: orderId })
      const { renderInvoicePdf } = await import("@/lib/invoice-pdf")
      const blob = await renderInvoicePdf(view)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `facture-${view.number ?? view.orderNumber}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={run}>
      {busy ? <Spinner /> : <FilePdfIcon />}
      Facture PDF
    </Button>
  )
}
