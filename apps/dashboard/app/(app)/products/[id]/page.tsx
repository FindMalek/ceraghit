import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { EditProductForm } from "@/components/product-form"

export const metadata: Metadata = { title: "Modifier le produit" }

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <PageHeader title="Modifier le produit" />
      <EditProductForm id={id} />
    </>
  )
}
