"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { countryName, SHIPPING_COUNTRIES, type ShopProfile, shopProfileInputSchema } from "@workspace/sdk"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { type ReactNode, useState } from "react"
import { LocalizedField } from "@/components/localized-field"
import { PhoneListField } from "@/components/phone-list-field"
import { SectionCard } from "@/components/profile/section-card"
import { SimpleSelect } from "@/components/simple-select"
import { EMAIL, PHONE } from "@/lib/contact"
import { errorMessage } from "@/lib/errors"
import { fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"

const COUNTRY_OPTIONS = SHIPPING_COUNTRIES.map((code) => ({ value: code as string, label: countryName(code, "fr") }))

const TEXT_FIELDS = [
  ["displayName", "Nom affiché", "Le nom de l'atelier tel que vos clients le voient."],
  ["legalName", "Raison sociale", undefined],
  ["legalForm", "Forme juridique", "ex. Personne physique, SUARL"],
  ["taxId", "Matricule fiscal", undefined],
  ["registryNumber", "Registre / patente (facultatif)", undefined],
] as const

type TextKey = (typeof TEXT_FIELDS)[number][0]

type Draft = Record<TextKey | "address" | "postalCode" | "city" | "email" | "notifyEmail", string>

const toDraft = (shop: ShopProfile): Draft => ({
  displayName: shop.displayName ?? "",
  legalName: shop.legalName ?? "",
  legalForm: shop.legalForm ?? "",
  taxId: shop.taxId ?? "",
  registryNumber: shop.registryNumber ?? "",
  address: shop.address ?? "",
  postalCode: shop.postalCode ?? "",
  city: shop.city ?? "",
  email: shop.email ?? "",
  notifyEmail: shop.notifyEmail ?? "",
})

const MESSAGES: Record<string, string> = {
  email: "Entrez une adresse email valide.",
  notifyEmail: "Entrez une adresse email valide.",
  phones: "Un numéro de téléphone n'est pas valide.",
  invoiceNote: "Le français est obligatoire si vous écrivez une mention.",
}

export function ShopSection({ initial, onSaved }: { initial: ShopProfile; onSaved?: () => void }) {
  const [draft, setDraft] = useState<Draft>(toDraft(initial))
  const [country, setCountry] = useState(initial.country || "TN")
  const [phones, setPhones] = useState(initial.phones)
  const [note, setNote] = useState<LocalizedDraft>(toLocalizedDraft(initial.invoiceNote))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const save = useMutation(
    orpc.admin.profile.update.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        onSaved?.()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  const set = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const submit = () => {
    const found: Record<string, string> = {}
    const cleanPhones = phones.map((p) => p.trim()).filter(Boolean)
    if (cleanPhones.some((p) => !PHONE.test(p))) found.phones = MESSAGES.phones as string
    for (const key of ["email", "notifyEmail"] as const) {
      if (draft[key].trim() && !EMAIL.test(draft[key].trim())) found[key] = MESSAGES[key] as string
    }
    const invoiceNote = fromLocalizedDraft(note, true)
    if (invoiceNote && !invoiceNote.fr) found.invoiceNote = MESSAGES.invoiceNote as string
    const text = (key: keyof Draft) => draft[key].trim() || null
    const parsed = shopProfileInputSchema.safeParse({
      displayName: text("displayName"),
      legalName: text("legalName"),
      legalForm: text("legalForm"),
      taxId: text("taxId"),
      registryNumber: text("registryNumber"),
      address: text("address"),
      postalCode: text("postalCode"),
      city: text("city"),
      country,
      phones: cleanPhones,
      email: text("email"),
      notifyEmail: text("notifyEmail"),
      invoiceNote,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        found[key] ??= MESSAGES[key] ?? "Ce champ est trop long ou invalide."
      }
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !parsed.success) {
      showError("Certains champs sont à corriger.")
      return
    }
    save.mutate(parsed.data)
  }

  const text = (key: keyof Draft, label: string, hint?: string, extra?: ReactNode) => (
    <Field key={key} data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`shop-${key}`}>{label}</FieldLabel>
      <Input
        id={`shop-${key}`}
        className="h-11"
        aria-invalid={Boolean(errors[key])}
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
      />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {extra}
    </Field>
  )

  return (
    <SectionCard
      title="Identité de l'atelier"
      description="Identité légale et contact, utilisés sur les factures, les emails et la page mentions légales."
      pending={save.isPending}
      saved={saved}
      onSubmit={submit}
    >
      <div className="grid gap-5 sm:grid-cols-2">{TEXT_FIELDS.map(([key, label, hint]) => text(key, label, hint))}</div>
      {text("address", "Adresse")}
      <div className="grid gap-5 sm:grid-cols-3">
        {text("postalCode", "Code postal")}
        {text("city", "Ville")}
        <Field>
          <FieldLabel htmlFor="shop-country">Pays</FieldLabel>
          <SimpleSelect id="shop-country" value={country} onChange={(v) => setCountry(v)} options={COUNTRY_OPTIONS} />
        </Field>
      </div>
      <PhoneListField
        value={phones}
        onChange={(next) => {
          setPhones(next)
          setSaved(false)
        }}
        error={errors.phones}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {text("email", "Email de contact", "Affiché sur le site. Vous répondez aux demandes depuis votre boîte mail.")}
        <Field data-invalid={Boolean(errors.notifyEmail)}>
          <FieldLabel htmlFor="shop-notifyEmail">Email des notifications</FieldLabel>
          <Input
            id="shop-notifyEmail"
            type="email"
            className="h-11"
            placeholder={draft.email}
            aria-invalid={Boolean(errors.notifyEmail)}
            value={draft.notifyEmail}
            onChange={(e) => set("notifyEmail", e.target.value)}
          />
          {errors.notifyEmail && <FieldError>{errors.notifyEmail}</FieldError>}
          <FieldDescription>Où vous recevez les nouvelles commandes. Par défaut, l'email de contact.</FieldDescription>
        </Field>
      </div>
      <LocalizedField
        id="shop-invoiceNote"
        label="Mention fiscale sur les factures"
        value={note}
        onChange={(next) => {
          setNote(next)
          setSaved(false)
        }}
        error={errors.invoiceNote}
        hint="ex. TVA non applicable, article ..."
      />
    </SectionCard>
  )
}
