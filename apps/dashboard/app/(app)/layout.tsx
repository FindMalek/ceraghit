import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { AppConfigProvider } from "@/components/app-config"
import { AppSidebar } from "@/components/app-sidebar"
import { admin, webUrl } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await admin((api) => api.auth.me())
  return (
    <AppConfigProvider value={{ webUrl: webUrl() }}>
      <SidebarProvider>
        <AppSidebar admin={me} webUrl={webUrl()} />
        <SidebarInset className="min-w-0 bg-transparent">{children}</SidebarInset>
      </SidebarProvider>
    </AppConfigProvider>
  )
}
