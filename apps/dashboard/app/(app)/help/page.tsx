import type { Metadata } from "next"
import { HelpView } from "@/components/help-view"
import { admin } from "@/lib/api"

export const metadata: Metadata = { title: "Aide" }

export default async function HelpPage() {
  const links = await admin((api) => api.help.get())
  return <HelpView initial={links} />
}
