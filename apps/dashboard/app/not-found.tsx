import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { StatusPage } from "@/components/status-page"

export default function NotFound() {
  return (
    <StatusPage code="404" title="Page introuvable" text="Cette page n'existe pas ou n'existe plus.">
      <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
        Vue d'ensemble
      </Link>
    </StatusPage>
  )
}
