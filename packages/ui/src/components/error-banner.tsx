"use client"

import { XIcon } from "@phosphor-icons/react"
import { useEffect, useSyncExternalStore } from "react"

/** The one place errors show up: an inline banner, not a popup. Success needs no message, the screen itself changes. */
let current: string | null = null
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

export function showError(message: string): void {
  current = message
  emit()
}

export function clearError(): void {
  if (current === null) return
  current = null
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Put it at the top of the page content. `resetKey` (the pathname) clears it when the visitor moves on. */
export function ErrorBanner({ closeLabel, resetKey }: { closeLabel: string; resetKey?: string }) {
  const message = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger
  useEffect(() => clearError(), [resetKey])
  if (!message) return null
  return (
    <div
      role="alert"
      className="mx-4 mt-4 flex items-start gap-3 border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive md:mx-6"
    >
      <p className="min-w-0 flex-1 text-base">{message}</p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={clearError}
        className="-m-2 grid size-11 shrink-0 place-items-center"
      >
        <XIcon className="size-5" />
      </button>
    </div>
  )
}
