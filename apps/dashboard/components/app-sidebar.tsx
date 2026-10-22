"use client"

import {
  ArrowSquareOutIcon,
  ChartLineUpIcon,
  EnvelopeSimpleIcon,
  GearIcon,
  MapPinIcon,
  PackageIcon,
  ReceiptIcon,
  SignOutIcon,
  TagIcon,
  TruckIcon,
} from "@phosphor-icons/react"
import { browserClient } from "@workspace/orpc/react"
import { Logo } from "@workspace/ui/brand/logo"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  { href: "/", label: "Vue d'ensemble", icon: ChartLineUpIcon },
  { href: "/products", label: "Produits", icon: PackageIcon },
  { href: "/categories", label: "Catégories", icon: TagIcon },
  { href: "/orders", label: "Commandes", icon: ReceiptIcon },
  { href: "/requests", label: "Demandes", icon: EnvelopeSimpleIcon },
  { href: "/shipping", label: "Livraison", icon: TruckIcon },
  { href: "/locations", label: "Ateliers", icon: MapPinIcon },
  { href: "/settings", label: "Réglages", icon: GearIcon },
]

export function AppSidebar({ admin, webUrl }: { admin: { name: string; email: string }; webUrl: string }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const signOut = async () => {
    await browserClient.admin.auth.logout().catch(() => {})
    window.location.assign("/login")
  }
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <Logo />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Atelier</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={item.label}
                    isActive={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
                    onClick={() => setOpenMobile(false)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Voir la boutique"
                  render={<a href={webUrl} target="_blank" rel="noreferrer" />}
                >
                  <ArrowSquareOutIcon />
                  <span>Voir la boutique</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Se déconnecter" onClick={signOut}>
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-primary">{admin.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{admin.name}</span>
                <span className="truncate text-muted-foreground text-xs">{admin.email}</span>
              </span>
              <SignOutIcon className="ml-auto" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
