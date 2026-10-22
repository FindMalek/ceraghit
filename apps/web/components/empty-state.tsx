import { Link } from "@/i18n/navigation"

export function EmptyState({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="frame flex flex-col items-center gap-4 bg-card/60 p-10 text-center">
      <p className="text-muted-foreground">{message}</p>
      <Link href="/shop" className="underline underline-offset-4">
        {cta}
      </Link>
    </div>
  )
}
