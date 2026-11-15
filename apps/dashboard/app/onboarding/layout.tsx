import { Logo } from "@workspace/ui/brand/logo"
import { redirect } from "next/navigation"
import { ErrorHost } from "@/components/error-host"
import { admin } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const setup = await admin((api) => api.setup.status())
  if (setup.onboarded) redirect("/")
  return (
    <div className="flex min-h-svh flex-col">
      <ErrorHost />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6">
        <div className="flex justify-center pb-8">
          <Logo />
        </div>
        {children}
      </main>
    </div>
  )
}
