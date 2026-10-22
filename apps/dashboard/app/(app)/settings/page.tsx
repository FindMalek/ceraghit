import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { SettingsForm } from "@/components/settings-form"

export const metadata: Metadata = { title: "Réglages" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Réglages" description="Contact et grille de livraison." />
      <SettingsForm />
    </>
  )
}
