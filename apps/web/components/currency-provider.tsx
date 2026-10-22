"use client"

import type { Currency } from "@workspace/sdk"
import { useRouter } from "next/navigation"
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { CURRENCY_COOKIE } from "@/lib/currency"

interface CurrencyContext {
  currency: Currency
  setCurrency: (currency: Currency) => void
}

const Context = createContext<CurrencyContext | null>(null)

export function CurrencyProvider({ initial, children }: { initial: Currency; children: ReactNode }) {
  const router = useRouter()
  const [currency, setState] = useState<Currency>(initial)
  const setCurrency = useCallback(
    (next: Currency) => {
      // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing from some mobile browsers
      document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      setState(next)
      router.refresh()
    },
    [router],
  )
  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCurrency(): CurrencyContext {
  const value = useContext(Context)
  if (!value) throw new Error("useCurrency needs a CurrencyProvider")
  return value
}
