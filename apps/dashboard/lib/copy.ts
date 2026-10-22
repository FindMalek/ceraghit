import type { Currency } from "@workspace/sdk"

export const PRODUCT_STATUS = { draft: "Brouillon", published: "Publié", archived: "Archivé" } as const
export const ORDER_STATUS = {
  pending_payment: "En attente de paiement",
  paid: "Payée",
  fulfilled: "Expédiée",
  cancelled: "Annulée",
  refunded: "Remboursée",
} as const
export const REQUEST_STATUS = {
  new: "Nouvelle",
  contacted: "Contactée",
  done: "Terminée",
  declined: "Refusée",
} as const

export const CURRENCY_LABEL: Record<Currency, string> = { TND: "Dinars (DT)", EUR: "Euros (€)" }

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Tunis" })
export const formatDate = (iso: string): string => DATE.format(new Date(iso))
