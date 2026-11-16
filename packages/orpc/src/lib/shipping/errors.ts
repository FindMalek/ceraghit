export type ShippingErrorCode = "unsupported" | "cod-tunisia-only" | "invalid-request" | "unavailable"

const MESSAGES: Record<ShippingErrorCode, string> = {
  unsupported: "Cette action n'est pas disponible pour ce transporteur.",
  "cod-tunisia-only": "Le paiement à la livraison n'est possible qu'en Tunisie.",
  "invalid-request": "Les informations d'expédition sont incomplètes.",
  unavailable: "Le transporteur est momentanément indisponible. Réessayez plus tard.",
}

export class ShippingError extends Error {
  constructor(readonly code: ShippingErrorCode) {
    super(MESSAGES[code])
    this.name = "ShippingError"
  }
}
