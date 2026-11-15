import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ProfileSections } from "@/components/profile/profile-sections"
import { admin } from "@/lib/api"

export const metadata: Metadata = { title: "Profil de l'atelier" }

export default async function ProfilePage() {
  const { owner, shop } = await admin((api) => api.profile.get())
  return (
    <>
      <PageHeader title="Profil de l'atelier" description="Identité légale, contact et compte bancaire." />
      <ProfileSections owner={owner} shop={shop} />
    </>
  )
}
