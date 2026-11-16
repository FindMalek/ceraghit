"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import type { AiSettings } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { useState } from "react"
import { SimpleSelect } from "@/components/simple-select"
import { errorMessage } from "@/lib/errors"

const MODELS = [
  { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
] as const

const EFFORTS = [
  { value: "low", label: "Rapide" },
  { value: "medium", label: "Plus réfléchi" },
] as const

const money = (value: number) => `${value.toFixed(2)} $`

/** Model, effort and monthly cap, plus the usage meter for the current studio month. */
export function AiSettingsCard() {
  const queryClient = useQueryClient()
  const status = useQuery(orpc.admin.ai.status.queryOptions())
  const settingsQuery = useQuery(orpc.admin.ai.settings.queryOptions())
  const [draft, setDraft] = useState<AiSettings | null>(null)
  const [saved, setSaved] = useState(false)

  const settings = draft ?? settingsQuery.data ?? null
  const save = useMutation(
    orpc.admin.ai.saveSettings.mutationOptions({
      onSuccess: () => {
        setSaved(true)
        setDraft(null)
        queryClient.invalidateQueries({ queryKey: orpc.admin.ai.key() })
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  if (!settings || !status.data) return null
  const usage = status.data.usage
  const cap = settings.monthlyCapUsd
  const ratio = cap && cap > 0 ? Math.min(100, (usage.costUsd / cap) * 100) : 0

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    setSaved(false)
    setDraft({ ...settings, [key]: value })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Traduction automatique</CardTitle>
            <CardDescription>Brouillonne les langues vides des fiches produit, catégories et adresses.</CardDescription>
          </div>
          <Badge variant={status.data.configured ? "secondary" : "outline"}>
            {status.data.configured ? "Clé Groq configurée" : "Aucune clé Groq"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ai-model">Modèle</FieldLabel>
            <SimpleSelect
              id="ai-model"
              value={settings.model}
              onChange={(v) => set("model", v)}
              options={MODELS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-effort">Effort</FieldLabel>
            <SimpleSelect
              id="ai-effort"
              value={settings.reasoningEffort}
              onChange={(v) => set("reasoningEffort", v)}
              options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))}
            />
          </Field>
        </div>
        <Field className="sm:max-w-48">
          <FieldLabel htmlFor="ai-cap">Plafond mensuel (USD)</FieldLabel>
          <Input
            id="ai-cap"
            className="h-11 tabular-nums"
            inputMode="decimal"
            placeholder="Aucun"
            value={settings.monthlyCapUsd ?? ""}
            onChange={(e) => {
              const text = e.target.value.trim()
              if (text === "") return set("monthlyCapUsd", null)
              const value = Number(text)
              if (Number.isFinite(value) && value >= 0) set("monthlyCapUsd", value)
            }}
          />
          <FieldDescription>Vide : aucune limite. Le plafond se remet à zéro le 1er du mois.</FieldDescription>
        </Field>

        <div className="frame space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              {usage.month} · {usage.requests} traductions ·{" "}
              <span className="tabular-nums">{usage.tokensIn + usage.tokensOut} tokens</span>
            </p>
            <p className="text-sm tabular-nums">
              {money(usage.costUsd)}
              {cap !== null && ` / ${money(cap)}`}
            </p>
          </div>
          <Progress value={cap !== null && cap > 0 ? ratio : 0} aria-label="Utilisation du plafond de traduction" />
          {cap !== null && usage.costUsd >= cap && (
            <p className="text-destructive text-sm">
              Plafond atteint, la traduction est bloquée jusqu'au mois prochain.
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {saved && <p className="text-muted-foreground text-sm">Enregistré.</p>}
        <Button
          type="button"
          className="h-11"
          disabled={save.isPending || !draft}
          onClick={() => save.mutate(settings)}
        >
          {save.isPending ? <Spinner /> : null}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  )
}
