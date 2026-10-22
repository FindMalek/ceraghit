"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { type Product, type ProductInput, pick, productInputSchema } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { ImageListField } from "@/components/image-field"
import { LocalizedField } from "@/components/localized-field"
import { MoneyInput } from "@/components/money-input"
import { ErrorState, LoadingRows } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { emptyVariant, type VariantDraft, VariantsField } from "@/components/variants-field"
import { PRODUCT_STATUS } from "@/lib/copy"
import { emptyLocalized, fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"
import { inputToMinor, minorToInput } from "@/lib/money"

interface Draft {
  ref: string
  categoryId: string
  title: LocalizedDraft
  description: LocalizedDraft
  material: LocalizedDraft
  technique: LocalizedDraft
  dimensions: string
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  priceTnd: string
  priceEur: string
  stock: string
  unique: boolean
  quoteOnly: boolean
  featured: boolean
  status: ProductInput["status"]
  images: { image: string; alt?: string | null }[]
  variants: VariantDraft[]
}

const EMPTY: Draft = {
  ref: "",
  categoryId: "",
  title: emptyLocalized(),
  description: emptyLocalized(),
  material: emptyLocalized(),
  technique: emptyLocalized(),
  dimensions: "",
  weightKg: "1",
  lengthCm: "20",
  widthCm: "20",
  heightCm: "10",
  priceTnd: "",
  priceEur: "",
  stock: "1",
  unique: false,
  quoteOnly: false,
  featured: false,
  status: "draft",
  images: [],
  variants: [],
}

const toDraft = (product: Product): Draft => ({
  ref: product.ref,
  categoryId: product.category.id,
  title: toLocalizedDraft(product.title),
  description: toLocalizedDraft(product.description),
  material: toLocalizedDraft(product.material),
  technique: toLocalizedDraft(product.technique),
  dimensions: product.dimensions ?? "",
  weightKg: String(product.weightGrams / 1000),
  lengthCm: String(product.lengthCm),
  widthCm: String(product.widthCm),
  heightCm: String(product.heightCm),
  priceTnd: minorToInput(product.prices.TND, "TND"),
  priceEur: minorToInput(product.prices.EUR, "EUR"),
  stock: String(product.stock),
  unique: product.unique,
  quoteOnly: product.quoteOnly,
  featured: product.featured,
  status: product.status,
  images: product.images.map(({ image, alt }) => ({ image, alt })),
  variants: product.variants.map((v) => ({
    id: v.id,
    label: toLocalizedDraft(v.label),
    priceTnd: minorToInput(v.prices.TND, "TND"),
    priceEur: minorToInput(v.prices.EUR, "EUR"),
    stock: String(v.stock),
  })),
})

type Errors = Record<string, string>

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field orientation="horizontal" className="frame items-center justify-between gap-4 bg-card/60 p-3">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

function ProductFormBody({ product }: { product: Product | null }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const categories = useQuery(orpc.admin.categories.list.queryOptions())
  const [draft, setDraft] = useState<Draft>(product ? toDraft(product) : EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const done = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.products.key() })
    queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
    toast.success(product ? "Produit enregistré." : "Produit créé.")
    router.push("/products")
  }
  const onError = (error: unknown) => toast.error(errorMessage(error))
  const create = useMutation(orpc.admin.products.create.mutationOptions({ onSuccess: done, onError }))
  const update = useMutation(orpc.admin.products.update.mutationOptions({ onSuccess: done, onError }))
  const busy = create.isPending || update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Errors = {}
    const priceTnd = inputToMinor(draft.priceTnd, "TND")
    const priceEur = inputToMinor(draft.priceEur, "EUR")
    const hasVariants = draft.variants.length > 0
    if (!hasVariants && priceTnd === null) found.priceTnd = "Entrez un prix en dinars (3 décimales maximum)."
    if (!hasVariants && priceEur === null) found.priceEur = "Entrez un prix en euros (2 décimales maximum)."
    const stock = Number(draft.stock)
    if (!hasVariants && (!Number.isInteger(stock) || stock < 0)) found.stock = "Entrez un nombre entier."
    const variants = draft.variants.map((v, i) => {
      const variantTnd = inputToMinor(v.priceTnd, "TND")
      const variantEur = inputToMinor(v.priceEur, "EUR")
      const variantStock = Number(v.stock)
      if (variantTnd === null) found[`variants.${i}.priceTnd`] = "Entrez un prix en dinars (3 décimales maximum)."
      if (variantEur === null) found[`variants.${i}.priceEur`] = "Entrez un prix en euros (2 décimales maximum)."
      if (!Number.isInteger(variantStock) || variantStock < 0) found[`variants.${i}.stock`] = "Entrez un nombre entier."
      return {
        id: v.id,
        label: fromLocalizedDraft(v.label),
        priceTnd: variantTnd ?? 0,
        priceEur: variantEur ?? 0,
        stock: Number.isInteger(variantStock) ? variantStock : 0,
      }
    })
    const weightKg = Number(draft.weightKg.trim().replace(",", "."))
    if (!Number.isFinite(weightKg) || weightKg <= 0) found.weightGrams = "Entrez un poids en kilos, par exemple 1,5."
    const box = (key: "lengthCm" | "widthCm" | "heightCm") => {
      const value = Number(draft[key])
      if (!Number.isInteger(value) || value < 1) found[key] = "Entrez des centimètres entiers."
      return value
    }
    const lengthCm = box("lengthCm")
    const widthCm = box("widthCm")
    const heightCm = box("heightCm")

    const parsed = productInputSchema.safeParse({
      ref: draft.ref,
      categoryId: draft.categoryId,
      title: fromLocalizedDraft(draft.title),
      description: fromLocalizedDraft(draft.description, true),
      material: fromLocalizedDraft(draft.material, true),
      technique: fromLocalizedDraft(draft.technique, true),
      dimensions: draft.dimensions.trim() || null,
      weightGrams: Math.round((Number.isFinite(weightKg) ? weightKg : 0) * 1000),
      lengthCm,
      widthCm,
      heightCm,
      priceTnd: hasVariants ? Math.min(...variants.map((v) => v.priceTnd)) : (priceTnd ?? 0),
      priceEur: hasVariants ? Math.min(...variants.map((v) => v.priceEur)) : (priceEur ?? 0),
      stock: hasVariants ? variants.reduce((sum, v) => sum + v.stock, 0) : Number.isInteger(stock) ? stock : 0,
      unique: draft.unique,
      quoteOnly: draft.quoteOnly,
      featured: draft.featured,
      status: draft.status,
      images: draft.images,
      variants,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".")
        found[key] = key.endsWith(".fr") ? "Le français est obligatoire." : issue.message
      }
    }
    if (!draft.categoryId) found.categoryId = "Choisissez une catégorie."
    setErrors(found)
    if (Object.keys(found).length > 0 || !parsed.success) {
      toast.error("Certains champs sont à corriger.")
      return
    }
    if (product) update.mutate({ id: product.id, ...parsed.data })
    else create.mutate(parsed.data)
  }

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: pick(c.name, "fr") }))

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <FieldGroup className="gap-8 px-4 py-6 md:px-6">
        <FieldSet>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.ref)}>
              <FieldLabel htmlFor="ref">Référence *</FieldLabel>
              <Input
                id="ref"
                className="h-11 tabular-nums"
                value={draft.ref}
                onChange={(e) => set("ref", e.target.value)}
                placeholder="0210"
              />
              {errors.ref && <FieldError>{errors.ref}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.categoryId)}>
              <FieldLabel htmlFor="category">Catégorie *</FieldLabel>
              <SimpleSelect
                id="category"
                value={draft.categoryId}
                onChange={(v) => set("categoryId", v)}
                options={categoryOptions}
                placeholder="Choisir…"
              />
              {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
            </Field>
          </div>
          <LocalizedField
            id="title"
            label="Titre"
            required
            value={draft.title}
            onChange={(v) => set("title", v)}
            error={errors["title.fr"] ?? errors.title}
          />
          <LocalizedField
            id="description"
            label="Description"
            multiline
            value={draft.description}
            onChange={(v) => set("description", v)}
            error={errors["description.fr"]}
          />
        </FieldSet>

        <FieldSet>
          <VariantsField
            value={draft.variants}
            onChange={(v) => set("variants", v)}
            errors={errors}
            onFirst={() =>
              set("variants", [
                { ...emptyVariant(), priceTnd: draft.priceTnd, priceEur: draft.priceEur, stock: draft.stock },
              ])
            }
          />
        </FieldSet>

        {draft.variants.length === 0 && (
          <FieldSet>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput
                id="price-tnd"
                label="Prix TND *"
                currency="TND"
                value={draft.priceTnd}
                onChange={(v) => set("priceTnd", v)}
                error={errors.priceTnd}
                hint="Le prix pour la Tunisie, en dinars (ex. 10)."
              />
              <MoneyInput
                id="price-eur"
                label="Prix EUR *"
                currency="EUR"
                value={draft.priceEur}
                onChange={(v) => set("priceEur", v)}
                error={errors.priceEur}
                hint="Le prix à l'international, en euros (ex. 34)."
              />
            </div>
            <Field data-invalid={Boolean(errors.stock)} className="sm:max-w-48">
              <FieldLabel htmlFor="stock">Stock</FieldLabel>
              <Input
                id="stock"
                className="h-11 tabular-nums"
                inputMode="numeric"
                value={draft.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
              {errors.stock && <FieldError>{errors.stock}</FieldError>}
            </Field>
          </FieldSet>
        )}

        <FieldSet>
          <LocalizedField
            id="material"
            label="Matière"
            value={draft.material}
            onChange={(v) => set("material", v)}
            error={errors["material.fr"]}
          />
          <LocalizedField
            id="technique"
            label="Technique"
            value={draft.technique}
            onChange={(v) => set("technique", v)}
            error={errors["technique.fr"]}
          />
          <Field>
            <FieldLabel htmlFor="dimensions">Dimensions</FieldLabel>
            <Input
              id="dimensions"
              className="h-11"
              value={draft.dimensions}
              onChange={(e) => set("dimensions", e.target.value)}
              placeholder="14 × 14 cm"
            />
          </Field>
        </FieldSet>

        <FieldSet>
          <FieldLabel>Emballage et livraison</FieldLabel>
          <FieldDescription>
            Sert à calculer la livraison : poids de la pièce emballée et taille de la boîte.
          </FieldDescription>
          <Field data-invalid={Boolean(errors.weightGrams)} className="sm:max-w-48">
            <FieldLabel htmlFor="weight">Poids emballé (kg)</FieldLabel>
            <Input
              id="weight"
              className="h-11 tabular-nums"
              inputMode="decimal"
              value={draft.weightKg}
              onChange={(e) => set("weightKg", e.target.value)}
              aria-invalid={Boolean(errors.weightGrams)}
            />
            {errors.weightGrams && <FieldError>{errors.weightGrams}</FieldError>}
          </Field>
          <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
            {(
              [
                ["lengthCm", "Longueur (cm)"],
                ["widthCm", "Largeur (cm)"],
                ["heightCm", "Hauteur (cm)"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} data-invalid={Boolean(errors[key])}>
                <FieldLabel htmlFor={key}>{label}</FieldLabel>
                <Input
                  id={key}
                  className="h-11 tabular-nums"
                  inputMode="numeric"
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                  aria-invalid={Boolean(errors[key])}
                />
                {errors[key] && <FieldError>{errors[key]}</FieldError>}
              </Field>
            ))}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLabel>Photos</FieldLabel>
          <ImageListField value={draft.images} onChange={(v) => set("images", v)} />
        </FieldSet>

        <FieldSet>
          <Field>
            <FieldLabel htmlFor="status">Statut</FieldLabel>
            <SimpleSelect
              id="status"
              value={draft.status}
              onChange={(v) => set("status", v)}
              options={Object.entries(PRODUCT_STATUS).map(([value, label]) => ({
                value: value as Draft["status"],
                label,
              }))}
              className="h-11 w-full sm:w-64"
            />
            <FieldDescription>Seuls les produits publiés apparaissent sur la boutique.</FieldDescription>
          </Field>
          <ToggleRow
            id="unique"
            label="Pièce unique"
            hint="Un seul exemplaire : elle quitte la boutique une fois vendue."
            checked={draft.unique}
            onChange={(v) => set("unique", v)}
          />
          <ToggleRow
            id="quote"
            label="Sur devis (pas de panier)"
            hint="Le bouton « Demander un devis » remplace « Ajouter au panier »."
            checked={draft.quoteOnly}
            onChange={(v) => set("quoteOnly", v)}
          />
          <ToggleRow
            id="featured"
            label="Mis en avant"
            hint="Affiché en premier sur l'accueil et dans la boutique."
            checked={draft.featured}
            onChange={(v) => set("featured", v)}
          />
        </FieldSet>
      </FieldGroup>

      <div className="sticky bottom-0 z-10 mt-auto flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Button type="button" variant="ghost" className="h-11" onClick={() => router.push("/products")}>
          Annuler
        </Button>
        <Button type="submit" className="h-11 min-w-40" disabled={busy}>
          {busy && <Spinner />}
          {product ? "Enregistrer" : "Créer le produit"}
        </Button>
      </div>
    </form>
  )
}

export function NewProductForm() {
  return <ProductFormBody product={null} />
}

export function EditProductForm({ id }: { id: string }) {
  const product = useQuery(orpc.admin.products.get.queryOptions({ input: { id } }))
  if (product.isPending) {
    return (
      <div className="px-4 py-6 md:px-6">
        <LoadingRows rows={4} />
      </div>
    )
  }
  if (product.isError)
    return (
      <div className="p-4 md:p-6">
        <ErrorState error={product.error} onRetry={() => product.refetch()} />
      </div>
    )
  return <ProductFormBody product={product.data} />
}
