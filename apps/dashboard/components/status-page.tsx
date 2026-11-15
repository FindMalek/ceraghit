export function StatusPage({
  code,
  title,
  text,
  digest,
  children,
}: {
  code?: string
  title: string
  text: string
  digest?: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <img src="/logo.webp" alt="Ceraghit" width={80} height={80} className="size-20 rounded-full" />
      {code ? <p className="font-display text-7xl text-gold">{code}</p> : null}
      <h1 className="text-3xl">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      {children}
      {digest ? <p className="text-muted-foreground text-xs">Référence : {digest}</p> : null}
    </main>
  )
}
