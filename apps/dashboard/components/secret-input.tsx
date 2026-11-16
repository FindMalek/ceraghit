"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"

/** Write-only: it only ever gets `{ configured, hint }`, never the stored value. `onChange(null)` clears it. */
export function SecretInput({
  id,
  label,
  configured,
  hint,
  disabled,
  onChange,
}: {
  id: string
  label: string
  configured: boolean
  hint: string | null
  disabled?: boolean
  /** A new value, null to clear, undefined to keep the stored one. */
  onChange: (value: string | null | undefined) => void
}) {
  const [replacing, setReplacing] = useState(!configured)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {replacing ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            type="password"
            autoComplete="off"
            disabled={disabled}
            className="w-full"
            onChange={(e) => onChange(e.target.value.trim() || undefined)}
          />
          {configured && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReplacing(false)
                onChange(undefined)
              }}
            >
              Annuler
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Badge variant="secondary">Configurée</Badge>
          {hint && <span className="font-mono text-sm text-muted-foreground">{hint}</span>}
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
            <Button type="button" variant="outline" disabled={disabled} onClick={() => setReplacing(true)}>
              Remplacer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                if (window.confirm("Effacer cette clé ?")) onChange(null)
              }}
            >
              Effacer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
