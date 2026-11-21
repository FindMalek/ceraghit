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

export const MAIL_KIND: Record<string, string> = {
  order_confirmation: "Confirmation de commande",
  order_studio: "Nouvelle commande (atelier)",
  request_studio: "Demande de pièce unique",
  payment_received: "Paiement reçu",
  order_expired: "Commande annulée (délai dépassé)",
  shipped: "Commande expédiée",
  test: "Test",
}

export const CURRENCY_LABEL: Record<Currency, string> = { TND: "Dinars (DT)", EUR: "Euros (€)" }

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Tunis" })
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Africa/Tunis" })
const DAY_YEAR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Tunis" })
export const formatDay = (iso: string): string => DAY.format(new Date(iso))
export const formatDayYear = (iso: string): string => DAY_YEAR.format(new Date(iso))
export const formatDate = (iso: string): string => DATE.format(new Date(iso))

export const PAYMENT_LABEL = {
  online: "En ligne",
  cod: "Espèces à la livraison",
  transfer: "Virement bancaire",
  payoneer: "Payoneer (lien de paiement)",
} as const

export const PAYMENT_SHORT = {
  online: "En ligne",
  cod: "Livraison",
  transfer: "Virement",
  payoneer: "Payoneer",
} as const

export const PAYMENT_TEXT = {
  online: "Paiement en ligne. ",
  cod: "Paiement en espèces à la livraison. ",
  transfer: "Paiement par virement bancaire. ",
  payoneer: "Paiement via Payoneer. ",
} as const

export const PAYMENT_PROVIDER: Record<string, string> = {
  konnect: "Konnect",
  demo: "Démo",
  cod: "Espèces",
  transfer: "Virement",
  payoneer: "Payoneer",
  manual: "Saisie manuelle",
}
