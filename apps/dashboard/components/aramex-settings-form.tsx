"use client"

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { AramexConfig, ConnectionTestResult, MaskedIntegration, ShippingSettings } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { type FormEvent, useState } from "react"
import { AramexCities } from "@/components/aramex-cities"
import { IntegrationSourceBadge } from "@/components/integration-source-badge"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { SecretInput } from "@/components/secret-input"
import { aramexTouched, validateAramex } from "@/lib/aramex-form"
import { errorMessage } from "@/lib/errors"

type Secrets = { password?: string | null; accountPin?: string | null }
type Shipper = NonNullable<AramexConfig["shipper"]>

const EMPTY_SHIPPER: Shipper = {
  companyName: "",
  personName: "",
  phone: "",
  email: "",
  line1: "",
  city: "",
}

const MODES: { value: ShippingSettings["provider"]; title: string; text: string }[] = [
  { value: "manual", title: "Manuel", text: "Vous saisissez le transporteur et le numéro de suivi vous-même." },
  { value: "aramex", title: "Aramex", text: "Prix, étiquettes et suivi calculés par Aramex." },
]

function TextField({
  id,
  label,
  help,
  value,
  onChange,
  type = "text",
  inputMode,
  error,
}: {
  id: string
  label: string
  help?: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "numeric" | "tel" | "email"
  error?: string | undefined
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        className="h-11"
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {help && <FieldDescription>{help}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  return (
    <ul role="status" className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
      {result.steps.map((step) => (
        <li key={step.name} className="flex items-start gap-2" data-step={step.name} data-ok={step.ok}>
          {step.ok ? (
            <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <XCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          )}
          <span>
            <strong className="font-medium">{step.name === "login" ? "Connexion" : "Tarif"}</strong>
            {" : "}
            {step.message}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Body({
  mode: initialMode,
  aramex,
  appEnv,
  degraded,
  simulated,
  saved,
  setSaved,
}: {
  mode: ShippingSettings
  aramex: MaskedIntegration
  appEnv: "local" | "preview" | "production"
  degraded: "missing-credentials" | null
  simulated: boolean
  saved: boolean
  setSaved: (saved: boolean) => void
}) {
  const queryClient = useQueryClient()
  const stored = aramex.config as AramexConfig
  const production = appEnv === "production"
  const [mode, setMode] = useState(initialMode)
  const [live, setLive] = useState(stored.mode === "live")
  const [confirmed, setConfirmed] = useState(stored.productTypesConfirmed === true)
  const [userName, setUserName] = useState(stored.userName ?? "")
  const [accountNumber, setAccountNumber] = useState(stored.accountNumber ?? "")
  const [accountEntity, setAccountEntity] = useState(stored.accountEntity ?? "TUN")
  const [country, setCountry] = useState(stored.accountCountryCode ?? "TN")
  const [dom, setDom] = useState(stored.productTypes?.DOM ?? "ONP")
  const [exp, setExp] = useState(stored.productTypes?.EXP ?? "PPX")
  const [shipper, setShipper] = useState<Shipper>(stored.shipper ?? EMPTY_SHIPPER)
  const [secrets, setSecrets] = useState<Secrets>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectionTestResult | null>(null)

  const config: AramexConfig = {
    mode: live ? "live" : "test",
    productTypesConfirmed: confirmed,
    userName: userName.trim(),
    accountNumber: accountNumber.trim(),
    accountEntity: accountEntity.trim(),
    accountCountryCode: country.trim(),
    productTypes: { DOM: dom.trim(), EXP: exp.trim() },
    ...(shipper.companyName ? { shipper } : {}),
  }
  const values = {
    userName,
    accountNumber,
    accountEntity,
    accountCountryCode: country,
    productTypes: { DOM: dom, EXP: exp },
    shipper,
    passwordSet: secrets.password === undefined ? (aramex.secrets.password?.configured ?? false) : !!secrets.password,
    pinSet: secrets.accountPin === undefined ? (aramex.secrets.accountPin?.configured ?? false) : !!secrets.accountPin,
  }
  const touched = aramexTouched(values)
  const errors = touched ? validateAramex(values) : {}
  const invalid = Object.keys(errors).length > 0
  const needsAramex = mode.provider === "aramex" && !touched
  const liveLocked = !production || !confirmed
  const touch = () => {
    setSaved(false)
    setError(null)
  }
  const setShip = (key: keyof Shipper) => (value: string) => {
    setShipper((s) => ({ ...s, [key]: value }))
    touch()
  }
  const bind = (set: (v: string) => void) => (value: string) => {
    set(value)
    touch()
  }

  const save = useMutation(
    orpc.admin.shipping.saveSettings.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        setSecrets({})
        queryClient.invalidateQueries({ queryKey: orpc.admin.shipping.key() })
      },
      onError: (e) => setError(errorMessage(e)),
    }),
  )
  const test = useMutation(
    orpc.admin.shipping.testConnection.mutationOptions({
      onSuccess: setResult,
      onError: (e) => {
        setResult(null)
        setError(errorMessage(e))
      },
    }),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setResult(null)
    if (invalid || needsAramex) return
    save.mutate({ mode, ...(touched ? { aramex: { config, secrets } } : {}) })
  }
  const runTest = () => {
    setError(null)
    setResult(null)
    if (!touched || invalid) return
    test.mutate({ config, secrets })
  }

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <FieldGroup className="gap-6 px-4 py-6 md:max-w-3xl md:px-6">
        {simulated && (
          <p role="status" data-testid="aramex-simulated" className="rounded-lg border bg-muted p-3 text-sm">
            Aramex simulé : aucune donnée n'est envoyée à Aramex.
          </p>
        )}
        {!production && (
          <p className="rounded-lg border bg-muted p-3 text-sm">
            Aramex reste en mode test hors production : aucun colis réel ne sera créé.
          </p>
        )}
        {production && !live && aramex.source !== "none" && (
          <p role="status" className="rounded-lg border border-primary bg-card p-3 text-sm">
            Aramex est en mode test : aucun colis réel ne sera créé.
          </p>
        )}
        {degraded && mode.provider === "aramex" && (
          <p role="status" className="rounded-lg border border-destructive p-3 text-sm">
            Identifiants Aramex incomplets : la livraison manuelle est utilisée en attendant.
          </p>
        )}

        <section className="flex flex-col gap-4" aria-labelledby="mode-title">
          <h2 id="mode-title" className="font-heading text-2xl">
            Mode de livraison
          </h2>
          <RadioGroup
            value={mode.provider}
            onValueChange={(value) => {
              setMode((m) => ({ ...m, provider: value as ShippingSettings["provider"] }))
              touch()
            }}
          >
            {MODES.map((m) => (
              <label
                key={m.value}
                htmlFor={`mode-${m.value}`}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-card p-4"
              >
                <RadioGroupItem id={`mode-${m.value}`} value={m.value} />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{m.title}</span>
                  <span className="text-muted-foreground text-sm">{m.text}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <Field orientation="horizontal" className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="quote-from-provider">
                Calculer le prix de livraison avec Aramex au paiement
              </FieldLabel>
              <FieldDescription>
                Si Aramex ne répond pas, le tarif forfaitaire est utilisé : le paiement ne bloque jamais.
              </FieldDescription>
            </div>
            <Switch
              id="quote-from-provider"
              checked={mode.quoteFromProvider}
              onCheckedChange={(on) => {
                setMode((m) => ({ ...m, quoteFromProvider: on }))
                touch()
              }}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="creds-title">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="creds-title" className="font-heading text-2xl">
              Identifiants Aramex
            </h2>
            <IntegrationSourceBadge source={aramex.source} />
          </div>
          {!aramex.vaultAvailable && (
            <p className="rounded-lg border border-destructive p-3 text-sm">
              Le coffre des clés n'est pas configuré sur ce serveur : les identifiants ne peuvent pas être enregistrés.
            </p>
          )}
          <Field>
            <FieldLabel>Environnement</FieldLabel>
            <RadioGroup
              value={live ? "live" : "test"}
              onValueChange={(value) => {
                setLive(value === "live")
                touch()
              }}
              className="grid-cols-2"
            >
              {(["test", "live"] as const).map((value) => (
                <label
                  key={value}
                  htmlFor={`env-${value}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-4"
                >
                  <RadioGroupItem id={`env-${value}`} value={value} disabled={value === "live" && liveLocked} />
                  {value === "test" ? "Test" : "Réel"}
                </label>
              ))}
            </RadioGroup>
            <FieldDescription>
              « Test » pour essayer sans créer de vrais colis. Passez en « Réel » quand Aramex vous a donné les
              identifiants de production.
            </FieldDescription>
            {liveLocked && (
              <FieldDescription className="text-foreground">
                {production
                  ? "Le mode réel reste désactivé tant que les types de produit ne sont pas confirmés ci-dessous."
                  : "Le mode réel n'est disponible qu'en production."}
              </FieldDescription>
            )}
          </Field>
          <TextField
            id="aramex-user"
            error={errors["userName"]}
            label="Nom d'utilisateur"
            inputMode="email"
            value={userName}
            onChange={bind(setUserName)}
            help="L'adresse e-mail de l'utilisateur API. Demandez à votre commercial Aramex : « un accès API Shipping Services (ShippingAPI.V2) pour notre compte »."
          />
          <div>
            <SecretInput
              id="aramex-password"
              label="Mot de passe"
              configured={aramex.secrets.password?.configured ?? false}
              hint={aramex.secrets.password?.hint ?? null}
              onChange={(v) => {
                setSecrets((s) => ({ ...s, password: v }))
                touch()
              }}
            />
            <FieldDescription className="mt-2">
              Le mot de passe de cet utilisateur API (pas celui de votre compte aramex.com si Aramex vous en a donné un
              autre).
            </FieldDescription>
            {errors.password && <FieldError>{errors.password}</FieldError>}
          </div>
          <TextField
            id="aramex-account"
            error={errors["accountNumber"]}
            label="Numéro de compte"
            inputMode="numeric"
            value={accountNumber}
            onChange={bind(setAccountNumber)}
            help="Votre numéro de compte client Aramex (chiffres uniquement), sur vos factures Aramex."
          />
          <div>
            <SecretInput
              id="aramex-pin"
              label="PIN du compte"
              configured={aramex.secrets.accountPin?.configured ?? false}
              hint={aramex.secrets.accountPin?.hint ?? null}
              onChange={(v) => {
                setSecrets((s) => ({ ...s, accountPin: v }))
                touch()
              }}
            />
            <FieldDescription className="mt-2">
              Code PIN associé au compte, fourni par Aramex avec l'accès API.
            </FieldDescription>
            {errors.accountPin && <FieldError>{errors.accountPin}</FieldError>}
          </div>
          <TextField
            id="aramex-entity"
            error={errors["accountEntity"]}
            label="Entité du compte"
            value={accountEntity}
            onChange={bind(setAccountEntity)}
            help="Code de 3 lettres de l'agence Aramex qui gère votre compte, souvent « TUN » pour la Tunisie. Demandez « AccountEntity » à votre commercial."
          />
          <TextField
            id="aramex-country"
            error={errors["accountCountryCode"]}
            label="Pays du compte"
            value={country}
            onChange={bind(setCountry)}
            help="Code pays du compte (TN pour la Tunisie)."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="aramex-dom"
              error={errors["dom"]}
              label="Type de produit national"
              value={dom}
              onChange={bind(setDom)}
            />
            <TextField
              id="aramex-exp"
              error={errors["exp"]}
              label="Type de produit international"
              value={exp}
              onChange={bind(setExp)}
            />
          </div>
          <FieldDescription>
            Codes de service Aramex. Demandez « les ProductType autorisés sur notre compte pour le national (DOM) et
            l'international (EXP) ». Par défaut : ONP et PPX.
          </FieldDescription>
          <Field orientation="horizontal" className="rounded-lg border bg-card p-4">
            <FieldLabel htmlFor="aramex-confirmed">Ces types de produit ont été confirmés par Aramex</FieldLabel>
            <Switch
              id="aramex-confirmed"
              checked={confirmed}
              onCheckedChange={(on) => {
                setConfirmed(on)
                if (!on) setLive(false)
                touch()
              }}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="shipper-title">
          <h2 id="shipper-title" className="font-heading text-2xl">
            Adresse d'expédition
          </h2>
          <TextField
            id="sh-company"
            error={errors["shipper.companyName"]}
            label="Société"
            value={shipper.companyName}
            onChange={setShip("companyName")}
          />
          <TextField
            id="sh-person"
            error={errors["shipper.personName"]}
            label="Nom du contact"
            value={shipper.personName}
            onChange={setShip("personName")}
          />
          <TextField
            id="sh-phone"
            error={errors["shipper.phone"]}
            label="Téléphone"
            inputMode="tel"
            value={shipper.phone}
            onChange={setShip("phone")}
          />
          <TextField
            id="sh-email"
            error={errors["shipper.email"]}
            label="E-mail"
            inputMode="email"
            value={shipper.email}
            onChange={setShip("email")}
          />
          <TextField
            id="sh-line1"
            error={errors["shipper.line1"]}
            label="Adresse"
            value={shipper.line1}
            onChange={setShip("line1")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="sh-city"
              error={errors["shipper.city"]}
              label="Ville"
              value={shipper.city}
              onChange={setShip("city")}
            />
            <TextField
              id="sh-postal"
              label="Code postal"
              value={shipper.postalCode ?? ""}
              onChange={setShip("postalCode")}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={test.isPending || !touched || invalid}
              onClick={runTest}
            >
              {test.isPending && <Spinner />}
              Tester la connexion
            </Button>
          </div>
          {(!touched || invalid) && (
            <FieldDescription>Renseignez les identifiants ci-dessus pour tester la connexion.</FieldDescription>
          )}
          {result && <TestResult result={result} />}
        </section>

        <AramexCities />

        {needsAramex && <FieldError>Renseignez les identifiants Aramex avant de choisir Aramex.</FieldError>}
        {error && <FieldError>{error}</FieldError>}
        {saved && (
          <p role="status" className="text-primary text-sm">
            Réglages de livraison enregistrés.
          </p>
        )}
        <Badge variant="secondary" className="self-start">
          {production ? "Production" : "Hors production"}
        </Badge>
      </FieldGroup>
      <div className="sticky bottom-0 z-10 mt-auto flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Button type="submit" className="h-11 min-w-40" disabled={save.isPending || invalid || needsAramex}>
          {save.isPending && <Spinner />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

export function AramexSettingsForm() {
  const [saved, setSaved] = useState(false)
  const query = useQuery(orpc.admin.shipping.getSettings.queryOptions({ input: {} }))
  if (query.isPending) {
    return (
      <div className="px-4 py-6 md:px-6">
        <LoadingRows rows={4} />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  }
  const { mode, aramex, appEnv, degraded, simulated } = query.data
  return (
    <Body
      key={aramex.updatedAt ?? "new"}
      mode={mode}
      aramex={aramex}
      appEnv={appEnv}
      degraded={degraded}
      simulated={simulated}
      saved={saved}
      setSaved={setSaved}
    />
  )
}
