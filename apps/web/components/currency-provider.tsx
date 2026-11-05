"use client"

import type { Currency } from "@workspace/sdk"
import { createContext, type ReactNode, useContext, useMemo } from "react"

interface CurrencyContext {
  currency: Currency
}

const Context = createContext<CurrencyContext | null>(null)

/** The currency comes from the visitor's country on the server (see lib/currency-server.ts), nobody switches it. */
export function CurrencyProvider({ initial, children }: { initial: Currency; children: ReactNode }) {
  const value = useMemo(() => ({ currency: initial }), [initial])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCurrency(): CurrencyContext {
  const value = useContext(Context)
  if (!value) throw new Error("useCurrency needs a CurrencyProvider")
  return value
}
