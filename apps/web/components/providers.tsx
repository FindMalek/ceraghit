"use client"

import { QueryProvider } from "@workspace/orpc/react"
import type { Currency } from "@workspace/sdk"
import { Toaster } from "@workspace/ui/components/sonner"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { CurrencyProvider } from "./currency-provider"

export function Providers({ currency, children }: { currency: Currency; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
      <QueryProvider>
        <CurrencyProvider initial={currency}>{children}</CurrencyProvider>
        <Toaster position="top-center" />
      </QueryProvider>
    </ThemeProvider>
  )
}
