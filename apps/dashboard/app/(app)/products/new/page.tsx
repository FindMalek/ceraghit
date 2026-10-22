import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { NewProductForm } from "@/components/product-form"

export const metadata: Metadata = { title: "Nouveau produit" }

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="Nouveau produit" description="Les deux prix sont obligatoires : dinars et euros." />
      <NewProductForm />
    </>
  )
}
