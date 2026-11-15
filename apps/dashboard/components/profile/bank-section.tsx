"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type ShopProfile, shopProfileInputSchema } from "@workspace/sdk"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"
import { SectionCard } from "@/components/profile/section-card"
import { errorMessage } from "@/lib/errors"
import { compactAccount, formatAccount } from "@/lib/format-account"

type BankProfile = Pick<ShopProfile, "bankHolder" | "bankName" | "bankRib" | "bankIban" | "bankBic">

const MESSAGES: Record<string, string> = {
  bankRib: "Le RIB compte 20 chiffres.",
  bankIban: "L'IBAN n'est pas valide (ex. TN59 1000 6035 1835 9847 8831).",
  bankBic: "Le BIC compte 8 ou 11 caractères.",
  bankHolder: "Ce nom est trop long.",
  bankName: "Ce nom est trop long.",
}

export function BankSection({ initial, onSaved }: { initial: BankProfile; onSaved?: () => void }) {
  const [holder, setHolder] = useState(initial.bankHolder ?? "")
  const [bank, setBank] = useState(initial.bankName ?? "")
  const [rib, setRib] = useState(formatAccount(initial.bankRib ?? ""))
  const [iban, setIban] = useState(formatAccount(initial.bankIban ?? ""))
  const [bic, setBic] = useState(compactAccount(initial.bankBic ?? ""))
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
    setSaved(false)
  }

  const submit = () => {
    const parsed = shopProfileInputSchema.safeParse({
      bankHolder: holder.trim() || null,
      bankName: bank.trim() || null,
      bankRib: compactAccount(rib) || null,
      bankIban: compactAccount(iban) || null,
      bankBic: compactAccount(bic) || null,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), MESSAGES[String(i.path[0])] ?? ""])),
      )
      return
    }
    setErrors({})
    save.mutate(parsed.data)
  }

  return (
    <SectionCard
      title="Compte bancaire"
      description="Ces coordonnées sont envoyées aux clients qui paient par virement. Tant qu'elles sont incomplètes, le virement n'est pas proposé."
      pending={save.isPending}
      saved={saved}
      onSubmit={submit}
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
        {errors.bankIban && <FieldError>{errors.bankIban}</FieldError>}
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
    </SectionCard>
  )
}
