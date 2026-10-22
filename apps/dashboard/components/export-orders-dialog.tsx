"use client"

import { DownloadSimpleIcon } from "@phosphor-icons/react"
import { errorMessage } from "@workspace/orpc/errors"
import { browserClient } from "@workspace/orpc/react"
import { buildOrdersCsv, type Currency } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useState } from "react"
import { toast } from "sonner"
import { SimpleSelect } from "@/components/simple-select"
import { CURRENCY_LABEL } from "@/lib/copy"
import { downloadTextFile, studioDayKey } from "@/lib/download"

const CURRENCIES = (Object.keys(CURRENCY_LABEL) as Currency[]).map((value) => ({
  value,
  label: CURRENCY_LABEL[value],
}))

/** One CSV per currency: dinars and euros are never summed in the same file. */
export function ExportOrdersDialog() {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(() => studioDayKey(29))
  const [to, setTo] = useState(() => studioDayKey())
  const [currency, setCurrency] = useState<Currency>("TND")
  const [busy, setBusy] = useState(false)
  const valid = from !== "" && to !== "" && from <= to

  async function run() {
    setBusy(true)
    try {
      const orders = await browserClient.admin.orders.export({ from, to, currency })
      if (orders.length === 0) {
        toast.info("Aucune commande payée sur cette période dans cette devise.")
        return
      }
      downloadTextFile(`commandes-${currency}-${from}_${to}.csv`, buildOrdersCsv(orders, currency, { bom: true }))
      toast.success(`${orders.length} commande${orders.length > 1 ? "s" : ""} exportée${orders.length > 1 ? "s" : ""}.`)
      setOpen(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11" />}>
        <DownloadSimpleIcon />
        Exporter en CSV
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exporter les commandes</DialogTitle>
          <DialogDescription>
            Les commandes payées ou expédiées de la période, une ligne par commande, avec un total en bas. Un fichier
            par devise.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-from">Du</Label>
            <Input
              id="export-from"
              type="date"
              className="h-11"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-to">Au (inclus)</Label>
            <Input id="export-to" type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="export-currency">Devise</Label>
            <SimpleSelect id="export-currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
          </div>
        </div>
        {!valid && <p className="text-destructive text-sm">La date de fin doit suivre la date de début.</p>}
        <DialogFooter>
          <Button className="h-11" onClick={run} disabled={!valid || busy}>
            {busy ? "Export en cours…" : "Télécharger le CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
