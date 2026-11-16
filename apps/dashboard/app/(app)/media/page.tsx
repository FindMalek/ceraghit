import type { Metadata } from "next"
import { Suspense } from "react"
import { MediaLibrary } from "@/components/media-library"

export const metadata: Metadata = { title: "Médiathèque" }

export default function MediaPage() {
  return (
    <Suspense>
      <MediaLibrary />
    </Suspense>
  )
}
