import "@workspace/ui/globals.css"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"
import { notFoundCopy } from "@/lib/error-copy"
import { FONT_VARIABLES } from "@/lib/fonts"

const copy = notFoundCopy("fr")

export const metadata: Metadata = { title: `${copy.title} · Ceraghit`, icons: { icon: "/logo.webp" } }

export default function RootNotFound() {
  return (
    <html lang="fr" className={cn(FONT_VARIABLES)}>
      <body className="min-h-dvh text-[1.0625rem] leading-relaxed">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-24 text-center">
          <img src="/logo.webp" alt="Ceraghit" width={96} height={96} className="size-24 rounded-full" />
          <p className="font-display text-8xl text-gold">404</p>
          <h1 className="text-4xl">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.text}</p>
          <a href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
            {copy.home}
          </a>
        </main>
      </body>
    </html>
  )
}
