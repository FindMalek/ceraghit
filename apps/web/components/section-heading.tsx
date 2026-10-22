import type { ReactNode } from "react"

export function SectionHeading({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <div className="space-y-3 text-center">
      {kicker && <p className="font-script text-4xl text-gold">{kicker}</p>}
      <h2 className="text-4xl md:text-5xl">{title}</h2>
      <div className="ornament mx-auto max-w-xs" aria-hidden>
        <span>◆</span>
      </div>
      {children && <p className="mx-auto max-w-2xl text-muted-foreground">{children}</p>}
    </div>
  )
}
