import "@workspace/ui/globals.css"
import { QueryProvider } from "@workspace/orpc/react"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import { FONT_VARIABLES } from "@/lib/fonts"

export const metadata: Metadata = {
  title: { default: "Ceraghit · Dashboard", template: "%s · Ceraghit" },
  icons: { icon: "/logo.webp" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={cn(FONT_VARIABLES)}>
      <body className="min-h-svh text-[17px]">
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
