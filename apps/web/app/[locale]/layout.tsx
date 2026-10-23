import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata, Viewport } from "next"
import { Almendra_Display, Amiri, Baskervville, EB_Garamond, Mrs_Saint_Delafield } from "next/font/google"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server"
import type { ReactNode } from "react"
import { MobileCartBar } from "@/components/mobile-cart-bar"
import { Providers } from "@/components/providers"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { routing } from "@/i18n/routing"
import { getCurrency } from "@/lib/currency-server"
import { SITE } from "@/lib/site"

const display = Almendra_Display({ subsets: ["latin"], weight: "400", variable: "--font-display-face" })
const serif = Baskervville({ subsets: ["latin"], variable: "--font-serif-face" })
const body = EB_Garamond({ subsets: ["latin"], variable: "--font-body-face" })
const script = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-script-face" })
const arabic = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-arabic-face" })

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "meta" })
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t("title"), template: `%s · ${SITE.name}` },
    description: t("description"),
    icons: { icon: "/logo.webp" },
    openGraph: {
      title: t("title"),
      description: t("description"),
      images: ["/catalogue/0200-1.webp"],
      siteName: SITE.name,
    },
    robots: SITE.isProduction ? undefined : { index: false, follow: false },
  }
}

export const viewport: Viewport = { themeColor: "#0b0b0b", colorScheme: "dark" }

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const [messages, currency, t] = await Promise.all([getMessages(), getCurrency(), getTranslations("nav")])
  const rtl = locale === "ar"
  return (
    <html
      lang={locale}
      dir={rtl ? "rtl" : "ltr"}
      className={cn(display.variable, serif.variable, body.variable, script.variable, arabic.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-dvh text-[1.0625rem] leading-relaxed">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers currency={currency}>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
            >
              {t("skip")}
            </a>
            <SiteHeader />
            <main id="content">{children}</main>
            <SiteFooter />
            <MobileCartBar />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
