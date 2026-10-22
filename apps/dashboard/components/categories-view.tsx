"use client"

import { ArrowDownIcon, ArrowUpIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { type Category, categoryInputSchema, imageSrc, pick } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { type FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"
import { useAppConfig } from "@/components/app-config"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ImageField } from "@/components/image-field"
import { LocalizedField } from "@/components/localized-field"
import { PageBody, PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState, LoadingRows } from "@/components/query-state"
import { emptyLocalized, fromLocalizedDraft, type LocalizedDraft, toLocalizedDraft } from "@/lib/localized"

interface Draft {
  name: LocalizedDraft
  description: LocalizedDraft
  image: string | null
  visible: boolean
}

const EMPTY: Draft = { name: emptyLocalized(), description: emptyLocalized(), image: null, visible: true }

function CategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setDraft(
      category
        ? {
            name: toLocalizedDraft(category.name),
            description: toLocalizedDraft(category.description),
            image: category.image,
            visible: category.visible,
          }
        : EMPTY,
    )
  }, [open, category])

  const done = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.categories.key() })
    toast.success(category ? "Catégorie enregistrée." : "Catégorie créée.")
    onOpenChange(false)
  }
  const onError = (e: unknown) => toast.error(errorMessage(e))
  const create = useMutation(orpc.admin.categories.create.mutationOptions({ onSuccess: done, onError }))
  const update = useMutation(orpc.admin.categories.update.mutationOptions({ onSuccess: done, onError }))
  const busy = create.isPending || update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = categoryInputSchema.safeParse({
      name: fromLocalizedDraft(draft.name),
      description: fromLocalizedDraft(draft.description, true),
      image: draft.image,
      visible: draft.visible,
    })
    if (!parsed.success) {
      setError("Le nom en français est obligatoire.")
      return
    }
    if (category) update.mutate({ id: category.id, ...parsed.data })
    else create.mutate(parsed.data)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="text-3xl">{category ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <LocalizedField
              id="cat-name"
              label="Nom"
              required
              value={draft.name}
              onChange={(name) => setDraft((d) => ({ ...d, name }))}
              error={error ?? undefined}
            />
            <LocalizedField
              id="cat-desc"
              label="Description"
              multiline
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
            />
            <Field>
              <FieldLabel>Image</FieldLabel>
              <ImageField
                folder="categories"
                value={draft.image}
                onChange={(image) => setDraft((d) => ({ ...d, image }))}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="cat-visible"
                checked={draft.visible}
                onCheckedChange={(visible) => setDraft((d) => ({ ...d, visible }))}
              />
              <FieldLabel htmlFor="cat-visible">Visible dans le menu</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-11" disabled={busy}>
              {busy && <Spinner />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CategoriesView() {
  const queryClient = useQueryClient()
  const { webUrl } = useAppConfig()
  const categories = useQuery(orpc.admin.categories.list.queryOptions())
  const [editing, setEditing] = useState<Category | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.categories.key() })
  const onError = (error: unknown) => toast.error(errorMessage(error))
  const reorder = useMutation(orpc.admin.categories.reorder.mutationOptions({ onSuccess: refresh, onError }))
  const remove = useMutation(
    orpc.admin.categories.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Catégorie supprimée.")
        refresh()
      },
      onError,
    }),
  )

  const rows = categories.data ?? []
  const move = (index: number, delta: number) => {
    const ids = rows.map((c) => c.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + delta, 0, id as string)
    reorder.mutate({ ids })
  }
  const openDialog = (category: Category | null) => {
    setEditing(category)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Catégories"
        description="Le menu de la boutique, dans cet ordre."
        actions={
          <Button size="lg" onClick={() => openDialog(null)}>
            <PlusIcon /> Nouvelle catégorie
          </Button>
        }
      />
      <PageBody>
        {categories.isPending && <LoadingRows rows={4} />}
        {categories.isError && <ErrorState error={categories.error} onRetry={() => categories.refetch()} />}
        {categories.data && rows.length === 0 && (
          <EmptyState title="Aucune catégorie" description="Créez la première pour ranger vos pièces." />
        )}
        <ul className="flex flex-col gap-3">
          {rows.map((category, index) => (
            <li key={category.id} className="frame flex flex-wrap items-center gap-3 bg-card/70 p-3">
              {category.image ? (
                // biome-ignore lint/performance/noImgElement: thumbnail of an uploaded or static image
                <img src={imageSrc(category.image, webUrl)} alt="" className="size-14 shrink-0 border object-cover" />
              ) : (
                <div className="size-14 shrink-0 border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl">{pick(category.name, "fr")}</p>
                <p className="text-muted-foreground text-sm">
                  <span className="tabular-nums">{category.productCount}</span> produit
                  {category.productCount > 1 ? "s" : ""}
                </p>
              </div>
              {!category.visible && <Badge variant="outline">Masquée</Badge>}
              <div className="flex gap-1">
                <Button
                  size="icon-lg"
                  variant="ghost"
                  aria-label="Monter"
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  size="icon-lg"
                  variant="ghost"
                  aria-label="Descendre"
                  disabled={index === rows.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button size="icon-lg" variant="ghost" aria-label="Modifier" onClick={() => openDialog(category)}>
                  <PencilSimpleIcon />
                </Button>
                <Button size="icon-lg" variant="ghost" aria-label="Supprimer" onClick={() => setToDelete(category)}>
                  <TrashIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </PageBody>
      <CategoryDialog category={editing} open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(next) => !next && setToDelete(null)}
        title={`Supprimer ${toDelete ? pick(toDelete.name, "fr") : ""} ?`}
        description="Une catégorie ne peut être supprimée que si elle ne contient plus aucun produit."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => toDelete && remove.mutate({ id: toDelete.id })}
      />
    </>
  )
}
