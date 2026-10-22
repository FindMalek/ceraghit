import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { LegalPage } from "@/components/legal-page"
import { isLegalDoc, LEGAL_DOCS } from "@/lib/legal"

export function generateStaticParams(): { doc: string }[] {
  return LEGAL_DOCS.map((doc) => ({ doc }))
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!isLegalDoc(doc)) return {}
  return { title: (await getTranslations("legal"))(`docs.${doc}.title`) }
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!isLegalDoc(doc)) notFound()
  return <LegalPage doc={doc} />
}
