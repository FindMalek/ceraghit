import { DEFAULT_SHIPPING_RATES, type PublicSettings } from "@workspace/sdk"

const EMAIL = "ceraghit@yahoo.fr"
const PHONES = ["+216 98 425 075", "+32 478 27 45 79"]

export const FALLBACK_SETTINGS: PublicSettings = {
  contactEmail: EMAIL,
  phones: PHONES,
  whatsapp: null,
  instagram: null,
  shippingRates: DEFAULT_SHIPPING_RATES,
  shippingNote: null,
  onlinePayments: false,
  profile: {
    displayName: "Ceraghit Creation",
    legalName: null,
    legalForm: null,
    taxId: null,
    address: null,
    postalCode: null,
    city: null,
    country: "TN",
    phones: PHONES,
    email: EMAIL,
  },
  paymentMethods: { online: false, cod: true, transfer: true },
}
