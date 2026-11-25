"use client"

import { useMutation } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@workspace/sdk"
import { clearError, showError } from "@workspace/ui/components/error-banner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"
import { SectionCard } from "@/components/profile/section-card"
import { errorMessage } from "@/lib/errors"

const EMPTY = { current: "", next: "", again: "" }
const WRONG = "Le mot de passe actuel est incorrect."

/** The owner's own password. The other sessions are signed out by the api, this one stays. */
export function PasswordSection() {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [saved, setSaved] = useState(false)

  const save = useMutation(
    orpc.admin.account.changePassword.mutationOptions({
      onSuccess: () => {
        clearError()
        setValues(EMPTY)
        setSaved(true)
      },
      onError: (e) => {
        const message = errorMessage(e)
        if (message === WRONG) setErrors({ current: message })
        else showError(message)
      },
    }),
  )

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: event.target.value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setSaved(false)
  }

  const submit = () => {
    const next: typeof errors = {}
    if (!values.current) next.current = "Entrez votre mot de passe actuel."
    if (values.next.length < PASSWORD_MIN_LENGTH)
      next.next = `Le nouveau mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`
    else if (values.next.length > PASSWORD_MAX_LENGTH) next.next = `Au plus ${PASSWORD_MAX_LENGTH} caractères.`
    else if (values.next === values.current) next.next = "Choisissez un mot de passe différent de l'actuel."
    if (values.again !== values.next) next.again = "Les deux mots de passe ne correspondent pas."
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate({ currentPassword: values.current, newPassword: values.next })
  }

  return (
    <SectionCard
      title="Changer mon mot de passe"
      description="Les autres appareils connectés seront déconnectés."
      pending={save.isPending}
      saved={saved}
      onSubmit={submit}
    >
      <Field data-invalid={Boolean(errors.current)}>
        <FieldLabel htmlFor="password-current">Mot de passe actuel</FieldLabel>
        <Input
          id="password-current"
          type="password"
          className="h-11"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.current)}
          value={values.current}
          onChange={set("current")}
        />
        {errors.current && <FieldError>{errors.current}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.next)}>
        <FieldLabel htmlFor="password-new">Nouveau mot de passe</FieldLabel>
        <Input
          id="password-new"
          type="password"
          className="h-11"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.next)}
          value={values.next}
          onChange={set("next")}
        />
        {errors.next ? (
          <FieldError>{errors.next}</FieldError>
        ) : (
          <FieldDescription>Au moins {PASSWORD_MIN_LENGTH} caractères.</FieldDescription>
        )}
      </Field>
      <Field data-invalid={Boolean(errors.again)}>
        <FieldLabel htmlFor="password-again">Confirmer le nouveau mot de passe</FieldLabel>
        <Input
          id="password-again"
          type="password"
          className="h-11"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.again)}
          value={values.again}
          onChange={set("again")}
        />
        {errors.again && <FieldError>{errors.again}</FieldError>}
      </Field>
    </SectionCard>
  )
}
