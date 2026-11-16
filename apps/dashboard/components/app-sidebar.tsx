"use client"

import {
  ArrowSquareOutIcon,
  ChartLineUpIcon,
  CreditCardIcon,
  EnvelopeSimpleIcon,
  GearIcon,
  ImagesIcon,
  MapPinIcon,
  PackageIcon,
  QuestionIcon,
  ReceiptIcon,
  SignOutIcon,
  StorefrontIcon,
  TagIcon,
  TruckIcon,
  WarningIcon,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useFailedMails } from "@/components/mail-banner"
import { useSetupStatus } from "@/lib/use-setup-status"

const NAV = [
  { href: "/", label: "Vue d'ensemble", icon: ChartLineUpIcon },
  { href: "/products", label: "Produits", icon: PackageIcon },
  { href: "/categories", label: "Catégories", icon: TagIcon },
  { href: "/media", label: "Médiathèque", icon: ImagesIcon },
  { href: "/orders", label: "Commandes", icon: ReceiptIcon },
  { href: "/requests", label: "Demandes", icon: EnvelopeSimpleIcon },
  { href: "/shipping", label: "Livraison", icon: TruckIcon },
  { href: "/payments", label: "Paiements", icon: CreditCardIcon },
  { href: "/locations", label: "Ateliers", icon: MapPinIcon },
  { href: "/settings/profile", label: "Profil", icon: StorefrontIcon },
  { href: "/settings", label: "Réglages", icon: GearIcon },
]

const EMAILS_NAV = { href: "/emails", label: "Emails", icon: WarningIcon }

const isActive = (href: string, pathname: string) =>
  href === "/" || href === "/settings" ? pathname === href : pathname.startsWith(href)

export function AppSidebar({ admin, webUrl }: { admin: { name: string; email: string }; webUrl: string }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const remaining = useSetupStatus().data?.remaining ?? 0
  const failedMails = useFailedMails()
  const nav = failedMails > 0 ? [...NAV.slice(0, 5), EMAILS_NAV, ...NAV.slice(5)] : NAV
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
              {nav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={item.label}
                    isActive={isActive(item.href, pathname)}
                    onClick={() => setOpenMobile(false)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {item.href === EMAILS_NAV.href && (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular-nums leading-5 group-data-[collapsible=icon]:hidden">
                        {failedMails}
                      </span>
                    )}
                  </SidebarMenuButton>
                  {item.href === "/settings/profile" && remaining > 0 && (
                    <SidebarMenuBadge className="bg-primary text-primary-foreground">
                      <span aria-hidden="true">{remaining}</span>
                      <span className="sr-only">{`${remaining} ${remaining > 1 ? "étapes" : "étape"} à terminer`}</span>
                    </SidebarMenuBadge>
                  )}
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
                  size="lg"
                  tooltip="Aide"
                  isActive={pathname.startsWith("/help")}
                  onClick={() => setOpenMobile(false)}
                  render={<Link href="/help" />}
                >
                  <QuestionIcon />
                  <span>Aide</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
