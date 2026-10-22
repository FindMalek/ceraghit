import type { Metadata } from "next"
import { LocationsView } from "@/components/locations-view"

export const metadata: Metadata = { title: "Ateliers" }

export default function LocationsPage() {
  return <LocationsView />
}
