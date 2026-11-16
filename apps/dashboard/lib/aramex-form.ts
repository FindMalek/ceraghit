import type { AramexConfig } from "@workspace/sdk"

export interface AramexFormValues {
  userName: string
  accountNumber: string
  accountEntity: string
  accountCountryCode: string
  productTypes: { DOM: string; EXP: string }
  shipper: NonNullable<AramexConfig["shipper"]>
  passwordSet: boolean
  pinSet: boolean
}

export type AramexErrors = Partial<Record<string, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Nothing typed and nothing stored: the owner is only choosing Manuel, so no Aramex data is sent. */
export function aramexTouched(v: AramexFormValues): boolean {
  const s = v.shipper
  return !!(v.userName.trim() || v.accountNumber.trim() || v.passwordSet || v.pinSet || s.companyName.trim())
}

/** French, field level. The shipper block is all or nothing. */
export function validateAramex(v: AramexFormValues): AramexErrors {
  const e: AramexErrors = {}
  if (!EMAIL.test(v.userName.trim())) e.userName = "Saisissez l'adresse e-mail de l'utilisateur API."
  if (!/^\d{4,12}$/.test(v.accountNumber.trim())) e.accountNumber = "Le numéro de compte compte 4 à 12 chiffres."
  if (!/^[A-Za-z]{3}$/.test(v.accountEntity.trim())) e.accountEntity = "Le code de l'entité compte 3 lettres."
  if (!/^[A-Za-z]{2}$/.test(v.accountCountryCode.trim())) e.accountCountryCode = "Le code pays compte 2 lettres."
  if (!v.passwordSet) e.password = "Saisissez le mot de passe."
  if (!v.pinSet) e.accountPin = "Saisissez le PIN du compte."
  if (v.productTypes.DOM.trim().length < 2) e.dom = "Saisissez le type de produit national."
  if (v.productTypes.EXP.trim().length < 2) e.exp = "Saisissez le type de produit international."
  const s = v.shipper
  const anyShipper = [s.companyName, s.personName, s.phone, s.email, s.line1, s.city].some((x) => x.trim())
  if (anyShipper) {
    const need: [keyof typeof s, string][] = [
      ["companyName", "la société"],
      ["personName", "le nom du contact"],
      ["phone", "le téléphone"],
      ["line1", "l'adresse"],
      ["city", "la ville"],
    ]
    for (const [key, label] of need) if (!s[key]?.trim()) e[`shipper.${key}`] = `Renseignez ${label}.`
    if (!EMAIL.test(s.email.trim())) e["shipper.email"] = "Saisissez une adresse e-mail valide."
  }
  return e
}
