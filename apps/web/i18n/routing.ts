import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["fr", "en", "ar"],
  defaultLocale: "fr",
  localePrefix: "as-needed",
  localeCookie: { sameSite: "lax", secure: process.env.APP_ENV === "production" },
})

export type AppLocale = (typeof routing.locales)[number]
