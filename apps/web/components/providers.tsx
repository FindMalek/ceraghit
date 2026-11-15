"use client"

import { QueryProvider } from "@workspace/orpc/react"
import type { Currency } from "@workspace/sdk"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { CurrencyProvider } from "./currency-provider"

export function Providers({ currency, nonce, children }: { currency: Currency; nonce?: string; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange nonce={nonce}>
      <QueryProvider>
        <CurrencyProvider initial={currency}>{children}</CurrencyProvider>
      </QueryProvider>
    </ThemeProvider>
  )
}
