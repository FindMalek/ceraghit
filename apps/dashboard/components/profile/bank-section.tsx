"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type ShopProfile, shopProfileInputSchema } from "@workspace/sdk"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"
import { useState } from "react"
import { SectionCard, type WizardMode } from "@/components/profile/section-card"
import { errorMessage } from "@/lib/errors"
import { compactAccount, formatAccount } from "@/lib/format-account"

type BankProfile = Pick<
  ShopProfile,
  | "bankHolder"
  | "bankName"
  | "bankRib"
  | "bankIban"
  | "bankBic"
  | "bankEurHolder"
  | "bankEurName"
  | "bankEurIban"
  | "bankEurBic"
  | "bankEurAddress"
>

const MESSAGES: Record<string, string> = {
  bankRib: "Le RIB compte 20 chiffres.",
  bankIban: "L'IBAN n'est pas valide (ex. TN59 1000 6035 1835 9847 8831).",
  bankBic: "Le BIC compte 8 ou 11 caractères.",
  bankHolder: "Ce nom est trop long.",
  bankName: "Ce nom est trop long.",
  bankEurIban: "L'IBAN n'est pas valide (ex. DE89 3704 0044 0532 0130 00).",
  bankEurBic: "Le BIC compte 8 ou 11 caractères.",
  bankEurHolder: "Ce nom est trop long.",
  bankEurName: "Ce nom est trop long.",
  bankEurAddress: "Cette adresse est trop longue.",
  eur: "Complétez le titulaire, la banque, l'IBAN et le BIC du compte en euros, ou videz-les.",
}

export function BankSection({
  initial,
  onSaved,
  wizard,
}: {
  initial: BankProfile
  onSaved?: () => void
  wizard?: WizardMode
}) {
  const [holder, setHolder] = useState(initial.bankHolder ?? "")
  const [bank, setBank] = useState(initial.bankName ?? "")
  const [rib, setRib] = useState(formatAccount(initial.bankRib ?? ""))
  const [iban, setIban] = useState(formatAccount(initial.bankIban ?? ""))
  const [bic, setBic] = useState(compactAccount(initial.bankBic ?? ""))
  const [eurHolder, setEurHolder] = useState(initial.bankEurHolder ?? "")
  const [eurBank, setEurBank] = useState(initial.bankEurName ?? "")
  const [eurIban, setEurIban] = useState(formatAccount(initial.bankEurIban ?? ""))
  const [eurBic, setEurBic] = useState(compactAccount(initial.bankEurBic ?? ""))
  const [eurAddress, setEurAddress] = useState(initial.bankEurAddress ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const save = useMutation(
    orpc.admin.profile.update.mutationOptions({
      onSuccess: () => {
        clearError()
        setSaved(true)
        onSaved?.()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value)
    setErrors({})
    setSaved(false)
  }

  const submit = () => {
    const parsed = shopProfileInputSchema.safeParse({
      bankHolder: holder.trim() || null,
      bankName: bank.trim() || null,
      bankRib: compactAccount(rib) || null,
      bankIban: compactAccount(iban) || null,
      bankBic: compactAccount(bic) || null,
      bankEurHolder: eurHolder.trim() || null,
      bankEurName: eurBank.trim() || null,
      bankEurIban: compactAccount(eurIban) || null,
      bankEurBic: compactAccount(eurBic) || null,
      bankEurAddress: eurAddress.trim() || null,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), MESSAGES[String(i.path[0])] ?? ""])),
      )
      return
    }
    const eur = [eurHolder.trim(), eurBank.trim(), eurIban.trim(), eurBic.trim()]
    if (eur.some(Boolean) && !eur.every(Boolean)) {
      setErrors({ eur: MESSAGES.eur! })
      return
    }
    setErrors({})
    save.mutate(parsed.data)
  }

  return (
    <SectionCard
      title="Compte bancaire"
      description="Ces coordonnées sont envoyées aux clients qui paient par virement (commandes en DT). Tant qu'elles sont incomplètes, le virement n'est pas proposé."
      pending={save.isPending}
      saved={saved}
      onSubmit={submit}
      wizard={wizard}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.bankHolder)}>
          <FieldLabel htmlFor="bank-holder">Titulaire du compte</FieldLabel>
          <Input
            id="bank-holder"
            className="h-11"
            aria-invalid={Boolean(errors.bankHolder)}
            value={holder}
            onChange={(e) => edit(setHolder)(e.target.value)}
          />
          {errors.bankHolder && <FieldError>{errors.bankHolder}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.bankName)}>
          <FieldLabel htmlFor="bank-name">Banque</FieldLabel>
          <Input
            id="bank-name"
            className="h-11"
            aria-invalid={Boolean(errors.bankName)}
            value={bank}
            onChange={(e) => edit(setBank)(e.target.value)}
          />
          {errors.bankName && <FieldError>{errors.bankName}</FieldError>}
        </Field>
      </div>
      <Field data-invalid={Boolean(errors.bankRib)}>
        <FieldLabel htmlFor="bank-rib">RIB</FieldLabel>
        <Input
          id="bank-rib"
          className="h-11 tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={Boolean(errors.bankRib)}
          value={rib}
          onChange={(e) => edit(setRib)(formatAccount(e.target.value))}
        />
        {errors.bankRib ? <FieldError>{errors.bankRib}</FieldError> : <FieldDescription>20 chiffres.</FieldDescription>}
      </Field>
      <Field data-invalid={Boolean(errors.bankIban)}>
        <FieldLabel htmlFor="bank-iban">IBAN</FieldLabel>
        <Input
          id="bank-iban"
          className="h-11 tabular-nums"
          autoComplete="off"
          aria-invalid={Boolean(errors.bankIban)}
          value={iban}
          onChange={(e) => edit(setIban)(formatAccount(e.target.value))}
        />
        {errors.bankIban ? (
          <FieldError>{errors.bankIban}</FieldError>
        ) : (
          <FieldDescription>Le numéro qui commence par TN59.</FieldDescription>
        )}
      </Field>
      <Field data-invalid={Boolean(errors.bankBic)}>
        <FieldLabel htmlFor="bank-bic">BIC / SWIFT</FieldLabel>
        <Input
          id="bank-bic"
          className="h-11 sm:max-w-xs"
          autoComplete="off"
          aria-invalid={Boolean(errors.bankBic)}
          value={bic}
          onChange={(e) => edit(setBic)(compactAccount(e.target.value))}
        />
        {errors.bankBic && <FieldError>{errors.bankBic}</FieldError>}
      </Field>
      <Separator />
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Compte en euros (facultatif)</h3>
        <p className="text-muted-foreground text-sm">
          Affiché à la place du compte ci-dessus sur les commandes payées en euros. S'il est vide, ces commandes
          affichent le compte ci-dessus.
        </p>
        {errors.eur && <FieldError>{errors.eur}</FieldError>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.bankEurHolder)}>
          <FieldLabel htmlFor="bank-eur-holder">Titulaire du compte</FieldLabel>
          <Input
            id="bank-eur-holder"
            className="h-11"
            aria-invalid={Boolean(errors.bankEurHolder)}
            value={eurHolder}
            onChange={(e) => edit(setEurHolder)(e.target.value)}
          />
          {errors.bankEurHolder && <FieldError>{errors.bankEurHolder}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.bankEurName)}>
          <FieldLabel htmlFor="bank-eur-name">Banque</FieldLabel>
          <Input
            id="bank-eur-name"
            className="h-11"
            aria-invalid={Boolean(errors.bankEurName)}
            value={eurBank}
            onChange={(e) => edit(setEurBank)(e.target.value)}
          />
          {errors.bankEurName && <FieldError>{errors.bankEurName}</FieldError>}
        </Field>
      </div>
      <Field data-invalid={Boolean(errors.bankEurIban)}>
        <FieldLabel htmlFor="bank-eur-iban">IBAN</FieldLabel>
        <Input
          id="bank-eur-iban"
          className="h-11 tabular-nums"
          autoComplete="off"
          aria-invalid={Boolean(errors.bankEurIban)}
          value={eurIban}
          onChange={(e) => edit(setEurIban)(formatAccount(e.target.value))}
        />
        {errors.bankEurIban && <FieldError>{errors.bankEurIban}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.bankEurBic)}>
        <FieldLabel htmlFor="bank-eur-bic">BIC / SWIFT</FieldLabel>
        <Input
          id="bank-eur-bic"
          className="h-11 sm:max-w-xs"
          autoComplete="off"
          aria-invalid={Boolean(errors.bankEurBic)}
          value={eurBic}
          onChange={(e) => edit(setEurBic)(compactAccount(e.target.value))}
        />
        {errors.bankEurBic && <FieldError>{errors.bankEurBic}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.bankEurAddress)}>
        <FieldLabel htmlFor="bank-eur-address">Adresse de la banque</FieldLabel>
        <Textarea
          id="bank-eur-address"
          rows={2}
          aria-invalid={Boolean(errors.bankEurAddress)}
          value={eurAddress}
          onChange={(e) => edit(setEurAddress)(e.target.value)}
        />
        <FieldDescription>Facultatif, utile pour les virements depuis l'étranger.</FieldDescription>
        {errors.bankEurAddress && <FieldError>{errors.bankEurAddress}</FieldError>}
      </Field>
    </SectionCard>
  )
}
