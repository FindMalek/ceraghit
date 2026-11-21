import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server"
import type { ReactNode } from "react"
import { ErrorHost } from "@/components/error-host"
import { MobileCartBar } from "@/components/mobile-cart-bar"
import { Providers } from "@/components/providers"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { routing } from "@/i18n/routing"
import { getSiteImages } from "@/lib/api"
import { getCurrency } from "@/lib/currency-server"
import { FONT_VARIABLES } from "@/lib/fonts"
import { SITE } from "@/lib/site"
import { siteImages } from "@/lib/site-images"

/** Every page carries the per-request CSP nonce, so none of them can be prerendered. */
export const dynamic = "force-dynamic"

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }))
}

const OG_LOCALES: Record<string, string> = { fr: "fr_FR", en: "en_US", ar: "ar_AR" }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const [t, images] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteImages()])
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t("title"), template: `%s · ${SITE.name}` },
    description: t("description"),
    icons: { icon: siteImages("logo", images, locale)[0]?.src ?? "/logo.webp" },
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: SITE.name,
      type: "website",
      locale: OG_LOCALES[locale] ?? "fr_FR",
    },
    twitter: { card: "summary_large_image" },
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
  const [messages, currency, t, nonce, images] = await Promise.all([
    getMessages(),
    getCurrency(),
    getTranslations("nav"),
    headers().then((list) => list.get("x-nonce") ?? undefined),
    getSiteImages(),
  ])
  const texture = siteImages("texture", images, locale)[0]?.src
  const rtl = locale === "ar"
  return (
    <html lang={locale} dir={rtl ? "rtl" : "ltr"} className={cn(FONT_VARIABLES)} suppressHydrationWarning>
      <body
        className="min-h-dvh text-[1.0625rem] leading-relaxed"
        style={
          texture && texture !== "/texture.webp"
            ? ({ "--brand-texture": `url("${texture}")` } as React.CSSProperties)
            : undefined
        }
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers currency={currency} nonce={nonce}>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
            >
              {t("skip")}
            </a>
            <SiteHeader />
            <main id="content" tabIndex={-1} className="outline-none">
              <ErrorHost />
              {children}
            </main>
            <SiteFooter />
            <MobileCartBar />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
