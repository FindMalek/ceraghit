import { cn } from "cn"

/** The round Ceraghit medallion from the catalogue. The file lives in each app's `public/logo.webp`. */
export function LogoMark({ src = "/logo.webp", className }: { src?: string; className?: string }) {
  // biome-ignore lint/performance/noImgElement: a 400px static medallion, no optimisation needed
  return <img src={src} alt="" aria-hidden className={cn("size-9 rounded-full", className)} />
}

export function Logo({
  name = "Ceraghit",
  kind,
  src,
  className,
}: {
  name?: string
  kind?: string
  src?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 sm:gap-3", className)}>
      <LogoMark src={src} />
      <span className="font-display text-2xl text-gold leading-none sm:text-3xl">{name}</span>
      {kind && (
        <span className="hidden font-heading text-muted-foreground text-xs uppercase tracking-widest sm:inline">
          {kind}
        </span>
      )}
    </span>
  )
}
