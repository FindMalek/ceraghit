"use client"

import { createContext, type ReactNode, useContext } from "react"

interface AppConfig {
  webUrl: string
}

const AppConfigContext = createContext<AppConfig>({ webUrl: "" })

export function AppConfigProvider({ value, children }: { value: AppConfig; children: ReactNode }) {
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>
}

export const useAppConfig = (): AppConfig => useContext(AppConfigContext)
