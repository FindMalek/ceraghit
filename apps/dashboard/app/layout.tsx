import "@workspace/ui/globals.css"
import { QueryProvider } from "@workspace/orpc/react"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import { Amiri, Cinzel, Cormorant_Unicase, EB_Garamond, Mrs_Saint_Delafield } from "next/font/google"

const display = Cormorant_Unicase({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-display-face",
  display: "swap",
})
const serif = Cinzel({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  variable: "--font-serif-face",
  display: "swap",
})
const body = EB_Garamond({ subsets: ["latin"], variable: "--font-body-face" })
const script = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-script-face" })
const arabic = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-arabic-face" })

export const metadata: Metadata = {
  title: { default: "Ceraghit · Dashboard", template: "%s · Ceraghit" },
  icons: { icon: "/logo.webp" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={cn(display.variable, serif.variable, body.variable, script.variable, arabic.variable)}>
      <body className="min-h-svh text-[17px]">
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
