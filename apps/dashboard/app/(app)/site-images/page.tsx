import type { Metadata } from "next"
import { SiteImagesView } from "@/components/site-images-view"

export const metadata: Metadata = { title: "Images du site" }

export default function SiteImagesPage() {
  return <SiteImagesView />
}
