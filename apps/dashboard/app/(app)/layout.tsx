import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { redirect } from "next/navigation"
import { AppConfigProvider } from "@/components/app-config"
import { AppSidebar } from "@/components/app-sidebar"
import { ErrorHost } from "@/components/error-host"
import { MobileTabBar } from "@/components/mobile-tab-bar"
import { admin, webUrl } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, setup] = await Promise.all([admin((api) => api.auth.me()), admin((api) => api.setup.status())])
  if (!setup.onboarded) redirect("/onboarding")
  return (
    <AppConfigProvider value={{ webUrl: webUrl() }}>
      <SidebarProvider>
        <AppSidebar admin={me} webUrl={webUrl()} />
        <SidebarInset className="min-w-0 bg-transparent">
          <ErrorHost />
          <div className="pb-20 md:pb-0">{children}</div>
        </SidebarInset>
        <MobileTabBar />
      </SidebarProvider>
    </AppConfigProvider>
  )
}
