"use client"

import { useMutation } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { Logo } from "@workspace/ui/brand/logo"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import type { FormEvent } from "react"

export function LoginForm() {
  const login = useMutation(orpc.admin.auth.login.mutationOptions({ onSuccess: () => window.location.assign("/") }))
  const error = login.error ? errorMessage(login.error) : null
  const busy = login.isPending || login.isSuccess

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    login.mutate({ email: String(form.get("email")), password: String(form.get("password")) })
  }

  return (
    <form onSubmit={submit} className="frame flex flex-col gap-6 bg-card/80 p-6 sm:p-8">
      <Logo kind="dashboard" />
      <div className="ornament" aria-hidden>
        ◆
      </div>
      <h1 className="text-4xl">Connexion</h1>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" required className="h-11" />
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
            className="h-11"
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" size="lg" disabled={busy} className="h-11">
          {busy && <Spinner />}
          Se connecter
        </Button>
      </FieldGroup>
    </form>
  )
}
