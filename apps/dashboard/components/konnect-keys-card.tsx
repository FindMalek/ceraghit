"use client"

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { type FormEvent, useState } from "react"
import { errorMessage } from "@/lib/errors"

type Result = { ok: boolean; message: string }

const INCOMPLETE = "Renseignez la clé API et l'identifiant du portefeuille."

export function KonnectKeysCard({ production }: { production: boolean }) {
  const queryClient = useQueryClient()
  const view = useQuery(orpc.admin.settings.konnect.get.queryOptions())
  const [apiKey, setApiKey] = useState("")
  const [walletId, setWalletId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const mode = production ? "live" : "test"
  const configured = view.data?.configured ?? false
  const typed = apiKey.trim() !== "" || walletId.trim() !== ""
  const complete = apiKey.trim().length >= 10 && walletId.trim().length >= 6

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.settings.key() })
  const fail = (e: unknown) => {
    setResult(null)
    setError(errorMessage(e))
  }
  const save = useMutation(
    orpc.admin.settings.konnect.save.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        setApiKey("")
        setWalletId("")
        refresh()
      },
      onError: fail,
    }),
  )
  const test = useMutation(orpc.admin.settings.konnect.test.mutationOptions({ onSuccess: setResult, onError: fail }))
  const clear = useMutation(
    orpc.admin.settings.konnect.clear.mutationOptions({
      onSuccess: () => {
        setSaved(false)
        setResult(null)
        refresh()
      },
      onError: fail,
    }),
  )

  const reset = () => {
    setSaved(false)
    setError(null)
    setResult(null)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    reset()
    if (!complete) return setError(INCOMPLETE)
    save.mutate({ apiKey: apiKey.trim(), walletId: walletId.trim(), mode })
  }
  const runTest = () => {
    reset()
    if (typed && !complete) return setError(INCOMPLETE)
    test.mutate(complete ? { apiKey: apiKey.trim(), walletId: walletId.trim(), mode } : { mode })
  }

  const source = view.data?.source ?? "none"
  return (
    <form onSubmit={submit} className="px-4 pt-6 md:max-w-3xl md:px-6">
      <FieldGroup className="gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl">Clés Konnect</h2>
          <Badge variant={production ? "default" : "secondary"}>{production ? "Live" : "Test (sandbox)"}</Badge>
          <Badge variant={source === "none" ? "outline" : "secondary"}>
            {source === "vault" ? "Enregistrées ici" : source === "env" ? "Valeur du serveur" : "Non configurées"}
          </Badge>
        </div>
        <FieldDescription>
          Vous trouvez ces deux valeurs dans votre espace Konnect, rubrique Intégration. Elles sont chiffrées et ne
          s'affichent plus après l'enregistrement.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="konnect-api-key">Clé API</FieldLabel>
          <Input
            id="konnect-api-key"
            type="password"
            autoComplete="off"
            className="h-11"
            placeholder={view.data?.keyLast4 ? `•••• ${view.data.keyLast4}` : ""}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              reset()
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="konnect-wallet">Identifiant du portefeuille (wallet ID)</FieldLabel>
          <Input
            id="konnect-wallet"
            autoComplete="off"
            className="h-11"
            placeholder={view.data?.walletIdMasked ?? ""}
            value={walletId}
            onChange={(e) => {
              setWalletId(e.target.value)
              reset()
            }}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={test.isPending || (!configured && !complete)}
            onClick={runTest}
          >
            {test.isPending && <Spinner />}
            Tester la connexion
          </Button>
          <Button type="submit" className="h-11" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Enregistrer
          </Button>
          {configured && source === "vault" && (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:ml-auto"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm("Supprimer les clés Konnect enregistrées ?")) clear.mutate({})
              }}
            >
              Supprimer les clés
            </Button>
          )}
        </div>
        {result && (
          <p
            role="status"
            className={`flex items-center gap-2 text-sm ${result.ok ? "text-primary" : "text-destructive"}`}
          >
            {result.ok ? <CheckCircleIcon weight="fill" /> : <XCircleIcon weight="fill" />}
            {result.message}
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
        {saved && (
          <p role="status" className="text-primary text-sm">
            Clés Konnect enregistrées.
          </p>
        )}
      </FieldGroup>
    </form>
  )
}
