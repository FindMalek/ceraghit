"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { type ShopProfile, shopProfileInputSchema, type UsdAccountType } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
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
  | "bankUsdHolder"
  | "bankUsdName"
  | "bankUsdAccount"
  | "bankUsdRouting"
  | "bankUsdSwift"
  | "bankUsdAccountType"
  | "bankUsdAddress"
>

const ACCOUNT_TYPES: { value: UsdAccountType; label: string }[] = [
  { value: "checking", label: "Courant (checking)" },
  { value: "savings", label: "Épargne (savings)" },
]

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
  bankUsdHolder: "Ce nom est trop long.",
  bankUsdName: "Ce nom est trop long.",
  bankUsdAccount: "Le numéro de compte compte 17 chiffres au plus.",
  bankUsdRouting: "Le numéro de routage n'est pas valide : vérifiez ses 9 chiffres.",
  bankUsdSwift: "Le code SWIFT compte 8 ou 11 caractères.",
  bankUsdAddress: "Cette adresse est trop longue.",
  bankUsd: "Complétez tous les champs du compte en dollars (l'adresse est facultative), ou videz-les.",
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
  const [showEur, setShowEur] = useState(
    [initial.bankEurHolder, initial.bankEurName, initial.bankEurIban, initial.bankEurBic, initial.bankEurAddress].some(
      Boolean,
    ),
  )
  const [usdHolder, setUsdHolder] = useState(initial.bankUsdHolder ?? "")
  const [usdBank, setUsdBank] = useState(initial.bankUsdName ?? "")
  const [usdAccount, setUsdAccount] = useState(initial.bankUsdAccount ?? "")
  const [usdRouting, setUsdRouting] = useState(initial.bankUsdRouting ?? "")
  const [usdSwift, setUsdSwift] = useState(initial.bankUsdSwift ?? "")
  const [usdType, setUsdType] = useState<string>(initial.bankUsdAccountType ?? "")
  const [usdAddress, setUsdAddress] = useState(initial.bankUsdAddress ?? "")
  const [showUsd, setShowUsd] = useState(
    [
      initial.bankUsdHolder,
      initial.bankUsdName,
      initial.bankUsdAccount,
      initial.bankUsdRouting,
      initial.bankUsdSwift,
      initial.bankUsdAccountType,
      initial.bankUsdAddress,
    ].some(Boolean),
  )
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
      bankUsdHolder: usdHolder.trim() || null,
      bankUsdName: usdBank.trim() || null,
      bankUsdAccount: compactAccount(usdAccount) || null,
      bankUsdRouting: compactAccount(usdRouting) || null,
      bankUsdSwift: compactAccount(usdSwift) || null,
      bankUsdAccountType: (usdType || null) as UsdAccountType | null,
      bankUsdAddress: usdAddress.trim() || null,
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
      {showEur ? (
        <>
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
        </>
      ) : (
        <Button type="button" variant="outline" className="h-11 self-start" onClick={() => setShowEur(true)}>
          Ajouter un compte en euros
        </Button>
      )}
      <Separator />
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Compte en dollars (facultatif)</h3>
        <p className="text-muted-foreground text-sm">
          Compte aux États-Unis, affiché en plus sur les commandes payées en euros. Les prix et le total restent en
          euros.
        </p>
        {errors.bankUsd && <FieldError>{errors.bankUsd}</FieldError>}
      </div>
      {showUsd ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.bankUsdHolder)}>
              <FieldLabel htmlFor="bank-usd-holder">Titulaire du compte</FieldLabel>
              <Input
                id="bank-usd-holder"
                className="h-11"
                aria-invalid={Boolean(errors.bankUsdHolder)}
                value={usdHolder}
                onChange={(e) => edit(setUsdHolder)(e.target.value)}
              />
              {errors.bankUsdHolder && <FieldError>{errors.bankUsdHolder}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.bankUsdName)}>
              <FieldLabel htmlFor="bank-usd-name">Banque</FieldLabel>
              <Input
                id="bank-usd-name"
                className="h-11"
                aria-invalid={Boolean(errors.bankUsdName)}
                value={usdBank}
                onChange={(e) => edit(setUsdBank)(e.target.value)}
              />
              {errors.bankUsdName && <FieldError>{errors.bankUsdName}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.bankUsdAccount)}>
            <FieldLabel htmlFor="bank-usd-account">Numéro de compte</FieldLabel>
            <Input
              id="bank-usd-account"
              className="h-11 tabular-nums"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(errors.bankUsdAccount)}
              value={usdAccount}
              onChange={(e) => edit(setUsdAccount)(e.target.value)}
            />
            {errors.bankUsdAccount && <FieldError>{errors.bankUsdAccount}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.bankUsdRouting)}>
            <FieldLabel htmlFor="bank-usd-routing">Numéro de routage (ABA)</FieldLabel>
            <Input
              id="bank-usd-routing"
              className="h-11 tabular-nums sm:max-w-xs"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(errors.bankUsdRouting)}
              value={usdRouting}
              onChange={(e) => edit(setUsdRouting)(e.target.value)}
            />
            {errors.bankUsdRouting ? (
              <FieldError>{errors.bankUsdRouting}</FieldError>
            ) : (
              <FieldDescription>9 chiffres.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.bankUsdSwift)}>
            <FieldLabel htmlFor="bank-usd-swift">SWIFT / BIC</FieldLabel>
            <Input
              id="bank-usd-swift"
              className="h-11 sm:max-w-xs"
              autoComplete="off"
              aria-invalid={Boolean(errors.bankUsdSwift)}
              value={usdSwift}
              onChange={(e) => edit(setUsdSwift)(compactAccount(e.target.value))}
            />
            {errors.bankUsdSwift && <FieldError>{errors.bankUsdSwift}</FieldError>}
          </Field>
          <Field>
            <FieldLabel id="bank-usd-type">Type de compte</FieldLabel>
            <RadioGroup
              aria-labelledby="bank-usd-type"
              className="grid-cols-2 sm:max-w-md"
              value={usdType}
              onValueChange={(value) => edit(setUsdType)(String(value))}
            >
              {ACCOUNT_TYPES.map((type) => (
                <label
                  key={type.value}
                  htmlFor={`bank-usd-type-${type.value}`}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <RadioGroupItem id={`bank-usd-type-${type.value}`} value={type.value} />
                  {type.label}
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field data-invalid={Boolean(errors.bankUsdAddress)}>
            <FieldLabel htmlFor="bank-usd-address">Adresse de la banque</FieldLabel>
            <Textarea
              id="bank-usd-address"
              rows={2}
              aria-invalid={Boolean(errors.bankUsdAddress)}
              value={usdAddress}
              onChange={(e) => edit(setUsdAddress)(e.target.value)}
            />
            <FieldDescription>Facultatif.</FieldDescription>
            {errors.bankUsdAddress && <FieldError>{errors.bankUsdAddress}</FieldError>}
          </Field>
          <Button
            type="button"
            variant="ghost"
            className="h-11 self-start"
            onClick={() => {
              for (const set of [
                setUsdHolder,
                setUsdBank,
                setUsdAccount,
                setUsdRouting,
                setUsdSwift,
                setUsdType,
                setUsdAddress,
              ]) {
                edit(set)("")
              }
              setShowUsd(false)
            }}
          >
            Retirer le compte en dollars
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" className="h-11 self-start" onClick={() => setShowUsd(true)}>
          Ajouter un compte en dollars
        </Button>
      )}
    </SectionCard>
  )
}
