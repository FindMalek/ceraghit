import type { Metadata } from "next"
import { AiSettingsCard } from "@/components/ai-settings-card"
import { PageHeader } from "@/components/page-header"
import { SettingsForm } from "@/components/settings-form"

export const metadata: Metadata = { title: "Réglages" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Réglages" description="Réseaux, livraison et traduction." />
      <div className="flex flex-col gap-6">
        <SettingsForm />
        <AiSettingsCard />
      </div>
    </>
  )
}
