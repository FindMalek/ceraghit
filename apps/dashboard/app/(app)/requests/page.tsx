import type { Metadata } from "next"
import { RequestsView } from "@/components/requests-view"

export const metadata: Metadata = { title: "Demandes" }

export default function RequestsPage() {
  return <RequestsView />
}
