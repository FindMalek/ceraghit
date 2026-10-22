import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b px-4 pt-3 pb-5 md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1 size-10 md:size-7" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <span className="text-muted-foreground text-sm">{title}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl leading-none md:text-5xl">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-6 px-4 py-6 md:px-6">{children}</div>
}
