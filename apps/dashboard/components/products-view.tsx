"use client"

import { ImageIcon, MagnifyingGlassIcon, MinusIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { formatMoney, imageSrc, type Product, pick } from "@workspace/sdk"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useAppConfig } from "@/components/app-config"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { SimpleSelect } from "@/components/simple-select"
import { ProductStatusBadge } from "@/components/status-badge"
import { PRODUCT_STATUS } from "@/lib/copy"
import { productToInput } from "@/lib/product-input"

type StatusFilter = "all" | keyof typeof PRODUCT_STATUS

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Tous les statuts" },
  ...Object.entries(PRODUCT_STATUS).map(([value, label]) => ({ value: value as keyof typeof PRODUCT_STATUS, label })),
]

function Cover({ product }: { product: Product }) {
  const { webUrl } = useAppConfig()
  const image = product.images[0]?.image
  return image ? (
    // biome-ignore lint/performance/noImgElement: thumbnail of an uploaded or static image
    <img src={imageSrc(image, webUrl)} alt="" loading="lazy" className="size-14 shrink-0 border object-cover" />
  ) : (
    <div className="grid size-14 shrink-0 place-items-center border text-muted-foreground">
      <ImageIcon />
    </div>
  )
}

/** "dès " in front of the lowest price when the variants are not all priced the same. */
function fromPrefix(product: Product, currency: "TND" | "EUR"): string {
  return new Set(product.variants.map((v) => v.prices[currency])).size > 1 ? "dès " : ""
}

function StockControl({
  product,
  onChange,
  busy,
}: {
  product: Product
  onChange: (stock: number) => void
  busy: boolean
}) {
  if (product.variants.length > 0) {
    return (
      <span className="text-sm tabular-nums">
        <span className={product.stock === 0 ? "text-destructive" : ""}>{product.stock}</span>
        <span className="text-muted-foreground"> · {product.variants.length} variantes</span>
      </span>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="Retirer une pièce du stock"
        disabled={busy || product.stock === 0}
        onClick={() => onChange(product.stock - 1)}
      >
        <MinusIcon />
      </Button>
      <span className={`w-8 text-center tabular-nums ${product.stock === 0 ? "text-destructive" : ""}`}>
        {product.stock}
      </span>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="Ajouter une pièce au stock"
        disabled={busy}
        onClick={() => onChange(product.stock + 1)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

export function ProductsView() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [categoryId, setCategoryId] = useState("all")
  const [toDelete, setToDelete] = useState<Product | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  const categories = useQuery(orpc.admin.categories.list.queryOptions())
  const products = useQuery(
    orpc.admin.products.list.queryOptions({
      input: {
        q: search || undefined,
        status: status === "all" ? undefined : status,
        categoryId: categoryId === "all" ? undefined : categoryId,
      },
    }),
  )

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.products.key() })
    queryClient.invalidateQueries({ queryKey: orpc.admin.overview.key() })
  }
  const update = useMutation(
    orpc.admin.products.update.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )
  const remove = useMutation(
    orpc.admin.products.remove.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.archived
            ? "Cette pièce a déjà été commandée : elle est archivée au lieu d'être supprimée."
            : "Produit supprimé.",
        )
        refresh()
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )

  const patch = (product: Product, change: Parameters<typeof productToInput>[1]) =>
    update.mutate({ id: product.id, ...productToInput(product, change) })
  const togglePublish = (product: Product) =>
    patch(product, { status: product.status === "published" ? "draft" : "published" })

  const categoryOptions = [
    { value: "all", label: "Toutes les catégories" },
    ...(categories.data ?? []).map((c) => ({ value: c.id, label: pick(c.name, "fr") })),
  ]
  const rows = products.data ?? []

  return (
    <>
      <PageHeader
        title="Produits"
        description="Le catalogue : prix en dinars et en euros, stock et photos."
        actions={
          <Link href="/products/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon /> Nouveau produit
          </Link>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3 md:flex-row">
          <InputGroup className="h-11 md:max-w-sm">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Référence ou nom" value={q} onChange={(event) => setQ(event.target.value)} />
          </InputGroup>
          <SimpleSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} className="h-11 w-full md:w-52" />
          <SimpleSelect
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
            className="h-11 w-full md:w-64"
          />
        </div>

        {products.isPending && <LoadingRows />}
        {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
        {products.data && rows.length === 0 && (
          <EmptyState
            title="Aucun produit"
            description="Aucun produit ne correspond à ces filtres."
            action={
              <Link href="/products/new" className={buttonVariants({ variant: "outline" })}>
                Créer un produit
              </Link>
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <ul className="flex flex-col gap-3 md:hidden">
              {rows.map((product) => (
                <li key={product.id} className="frame flex flex-col gap-3 bg-card/70 p-3">
                  <Link href={`/products/${product.id}`} className="flex gap-3">
                    <Cover product={product} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg">{pick(product.title, "fr")}</p>
                      <p className="text-muted-foreground text-sm">
                        <span className="tabular-nums">{product.ref}</span> · {pick(product.category.name, "fr")}
                      </p>
                      <p className="tabular-nums">
                        {fromPrefix(product, "TND")}
                        {formatMoney(product.prices.TND, "TND", "fr")} · {fromPrefix(product, "EUR")}
                        {formatMoney(product.prices.EUR, "EUR", "fr")}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between gap-2">
                    <ProductStatusBadge status={product.status} />
                    <StockControl
                      product={product}
                      busy={update.isPending}
                      onChange={(stock) => patch(product, { stock })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      disabled={update.isPending}
                      onClick={() => togglePublish(product)}
                    >
                      {product.status === "published" ? "Dépublier" : "Publier"}
                    </Button>
                    <Button variant="ghost" size="icon-lg" aria-label="Supprimer" onClick={() => setToDelete(product)}>
                      <TrashIcon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="frame hidden bg-card/70 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20" />
                    <TableHead>Réf.</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Prix DT</TableHead>
                    <TableHead className="text-right">Prix €</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-48" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Cover product={product} />
                      </TableCell>
                      <TableCell className="tabular-nums">{product.ref}</TableCell>
                      <TableCell>
                        <Link href={`/products/${product.id}`} className="hover:text-primary">
                          {pick(product.title, "fr")}
                        </Link>
                        <div className="flex gap-1 text-muted-foreground text-sm">
                          {product.unique && <span>Pièce unique</span>}
                          {product.quoteOnly && <span>· Sur devis</span>}
                        </div>
                      </TableCell>
                      <TableCell>{pick(product.category.name, "fr")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fromPrefix(product, "TND")}
                        {formatMoney(product.prices.TND, "TND", "fr")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fromPrefix(product, "EUR")}
                        {formatMoney(product.prices.EUR, "EUR", "fr")}
                      </TableCell>
                      <TableCell>
                        <StockControl
                          product={product}
                          busy={update.isPending}
                          onChange={(stock) => patch(product, { stock })}
                        />
                      </TableCell>
                      <TableCell>
                        <ProductStatusBadge status={product.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={update.isPending}
                            onClick={() => togglePublish(product)}
                          >
                            {product.status === "published" ? "Dépublier" : "Publier"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Supprimer"
                            onClick={() => setToDelete(product)}
                          >
                            <TrashIcon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PageBody>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Supprimer ${toDelete ? pick(toDelete.title, "fr") : ""} ?`}
        description="Si cette pièce a déjà été commandée, elle sera archivée pour garder l'historique des commandes."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => toDelete && remove.mutate({ id: toDelete.id })}
      />
    </>
  )
}
