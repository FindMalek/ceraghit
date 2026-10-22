import "@workspace/ui/globals.css"
import { QueryProvider } from "@workspace/orpc/react"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import { Almendra_Display, Baskervville, EB_Garamond, Mrs_Saint_Delafield } from "next/font/google"

const display = Almendra_Display({ subsets: ["latin"], weight: "400", variable: "--font-display-face" })
const serif = Baskervville({ subsets: ["latin"], variable: "--font-serif-face" })
const body = EB_Garamond({ subsets: ["latin"], variable: "--font-body-face" })
const script = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-script-face" })

export const metadata: Metadata = {
  title: { default: "Ceraghit · Dashboard", template: "%s · Ceraghit" },
  icons: { icon: "/logo.webp" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={cn(display.variable, serif.variable, body.variable, script.variable)}>
      <body className="min-h-svh text-[17px]">
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
