"use client"

import { DownloadSimpleIcon } from "@phosphor-icons/react"
import { errorMessage } from "@workspace/orpc/errors"
import { browserClient } from "@workspace/orpc/react"
import { buildSalesCsv, type Currency, salesByDay } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { useState } from "react"
import { toast } from "sonner"
import { SimpleSelect } from "@/components/simple-select"
import { CURRENCY_LABEL } from "@/lib/copy"
import { downloadTextFile, studioDayKey } from "@/lib/download"

const CURRENCIES = (Object.keys(CURRENCY_LABEL) as Currency[]).map((value) => ({
  value,
  label: CURRENCY_LABEL[value],
}))

/** Revenue per day for the selected range and one currency, built from the same orders as the orders CSV. */
export function ExportSalesButton({ days }: { days: number }) {
  const [currency, setCurrency] = useState<Currency>("TND")
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const from = studioDayKey(days - 1)
      const to = studioDayKey()
      const orders = await browserClient.admin.orders.export({ from, to, currency })
      if (orders.length === 0) {
        toast.info("Aucune vente dans cette devise sur la période.")
        return
      }
      downloadTextFile(
        `ventes-${currency}-${from}_${to}.csv`,
        buildSalesCsv(salesByDay(orders), currency, { bom: true }),
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <SimpleSelect value={currency} onChange={setCurrency} options={CURRENCIES} className="h-11 w-40" />
      <Button variant="outline" className="h-11" onClick={run} disabled={busy}>
        <DownloadSimpleIcon />
        Exporter les ventes
      </Button>
    </div>
  )
}
