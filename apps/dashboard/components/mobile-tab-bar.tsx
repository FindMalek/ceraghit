"use client"

import { ChartLineUpIcon, EnvelopeSimpleIcon, ListIcon, PackageIcon, ReceiptIcon } from "@phosphor-icons/react"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/", label: "Aperçu", icon: ChartLineUpIcon },
  { href: "/products", label: "Produits", icon: PackageIcon },
  { href: "/orders", label: "Commandes", icon: ReceiptIcon },
  { href: "/requests", label: "Demandes", icon: EnvelopeSimpleIcon },
]

/** Screens that have their own sticky save bar at the bottom of the phone. */
const HIDDEN_ON = [/^\/products\/.+/, /^\/settings/, /^\/shipping/]

/** The four screens the owner opens all day, one thumb away; everything else is behind Menu. */
export function MobileTabBar() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  if (HIDDEN_ON.some((pattern) => pattern.test(pathname))) return null
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const item = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs outline-none"
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn(item, active(href) ? "text-primary" : "text-muted-foreground")}
        >
          <Icon className="size-6" weight={active(href) ? "fill" : "regular"} />
          {label}
        </Link>
      ))}
      <button type="button" onClick={() => setOpenMobile(true)} className={cn(item, "text-muted-foreground")}>
        <ListIcon className="size-6" />
        Menu
      </button>
    </nav>
  )
}
