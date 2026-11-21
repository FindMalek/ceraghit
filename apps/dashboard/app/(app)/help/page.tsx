import type { Metadata } from "next"
import { HelpView } from "@/components/help-view"
import { admin } from "@/lib/api"

export const metadata: Metadata = { title: "Aide" }

export default async function HelpPage() {
  const [links, library] = await Promise.all([admin((api) => api.help.get()), admin((api) => api.help.library())])
  return <HelpView initial={links} library={library} />
}
