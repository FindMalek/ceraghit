"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"
import { SectionCard } from "@/components/profile/section-card"
import { errorMessage } from "@/lib/errors"

export function OwnerSection({ initial, onSaved }: { initial: { name: string }; onSaved?: () => void }) {
  const [name, setName] = useState(initial.name)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const save = useMutation(
    orpc.admin.profile.updateOwner.mutationOptions({
      onSuccess: () => {
        clearError()
        setSaved(true)
        onSaved?.()
      },
      onError: (e) => showError(errorMessage(e)),
    }),
  )

  const submit = () => {
    const value = name.trim()
    if (value.length < 2 || value.length > 80) {
      setError("Entrez votre nom (2 à 80 caractères).")
      return
    }
    setError(undefined)
    save.mutate({ name: value })
  }

  return (
    <SectionCard
      title="Vous"
      description="Le nom affiché dans le tableau de bord."
      pending={save.isPending}
      saved={saved}
      onSubmit={submit}
    >
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="owner-name">Votre prénom et nom</FieldLabel>
        <Input
          id="owner-name"
          className="h-11"
          autoComplete="name"
          aria-invalid={Boolean(error)}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
        {error && <FieldError>{error}</FieldError>}
        <FieldDescription>Votre email de connexion ne change pas.</FieldDescription>
      </Field>
    </SectionCard>
  )
}
