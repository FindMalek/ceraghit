"use client"

import { MapPinIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { errorMessage } from "@workspace/orpc/errors"
import { orpc } from "@workspace/orpc/react"
import { imageSrc, locationInputSchema } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
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

type LocationRow = {
  id: string
  name: string
  description: { fr: string; en?: string; ar?: string } | null
  address: string
  city: string
  country: string
  phone: string | null
  hours: { fr: string; en?: string; ar?: string } | null
  mapUrl: string | null
  image: string | null
  visible: boolean
}

interface Draft {
  name: string
  description: LocalizedDraft
  address: string
  city: string
  country: string
  phone: string
  hours: LocalizedDraft
  mapUrl: string
  image: string | null
  visible: boolean
}

const EMPTY: Draft = {
  name: "",
  description: emptyLocalized(),
  address: "",
  city: "",
  country: "Tunisie",
  phone: "",
  hours: emptyLocalized(),
  mapUrl: "",
  image: null,
  visible: true,
}

function LocationSheet({
  location,
  open,
  onOpenChange,
}: {
  location: LocationRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(
      location
        ? {
            name: location.name,
            description: toLocalizedDraft(location.description),
            address: location.address,
            city: location.city,
            country: location.country,
            phone: location.phone ?? "",
            hours: toLocalizedDraft(location.hours),
            mapUrl: location.mapUrl ?? "",
            image: location.image,
            visible: location.visible,
          }
        : EMPTY,
    )
  }, [open, location])

  const done = () => {
    queryClient.invalidateQueries({ queryKey: orpc.admin.locations.key() })
    toast.success(location ? "Atelier enregistré." : "Atelier ajouté.")
    onOpenChange(false)
  }
  const onError = (e: unknown) => toast.error(errorMessage(e))
  const create = useMutation(orpc.admin.locations.create.mutationOptions({ onSuccess: done, onError }))
  const update = useMutation(orpc.admin.locations.update.mutationOptions({ onSuccess: done, onError }))
  const busy = create.isPending || update.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = locationInputSchema.safeParse({
      name: draft.name,
      description: fromLocalizedDraft(draft.description, true),
      address: draft.address,
      city: draft.city,
      country: draft.country,
      phone: draft.phone.trim() || null,
      hours: fromLocalizedDraft(draft.hours, true),
      mapUrl: draft.mapUrl.trim() || null,
      image: draft.image,
      visible: draft.visible,
    })
    if (!parsed.success) {
      const found: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        found[key] = key === "mapUrl" ? "Collez un lien complet (https://…)." : "Ce champ est obligatoire."
      }
      setErrors(found)
      return
    }
    if (location) update.mutate({ id: location.id, ...parsed.data })
    else create.mutate(parsed.data)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle className="text-3xl">{location ? "Modifier l'atelier" : "Nouvel atelier"}</SheetTitle>
          </SheetHeader>
          <FieldGroup className="flex-1 px-4">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="loc-name">Nom *</FieldLabel>
              <Input id="loc-name" className="h-11" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.address)}>
              <FieldLabel htmlFor="loc-address">Adresse *</FieldLabel>
              <Input
                id="loc-address"
                className="h-11"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
              {errors.address && <FieldError>{errors.address}</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.city)}>
                <FieldLabel htmlFor="loc-city">Ville *</FieldLabel>
                <Input
                  id="loc-city"
                  className="h-11"
                  value={draft.city}
                  onChange={(e) => set("city", e.target.value)}
                />
                {errors.city && <FieldError>{errors.city}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(errors.country)}>
                <FieldLabel htmlFor="loc-country">Pays *</FieldLabel>
                <Input
                  id="loc-country"
                  className="h-11"
                  value={draft.country}
                  onChange={(e) => set("country", e.target.value)}
                />
                {errors.country && <FieldError>{errors.country}</FieldError>}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="loc-phone">Téléphone</FieldLabel>
              <Input
                id="loc-phone"
                className="h-11"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <LocalizedField id="loc-hours" label="Horaires" value={draft.hours} onChange={(v) => set("hours", v)} />
            <LocalizedField
              id="loc-desc"
              label="Description"
              multiline
              value={draft.description}
              onChange={(v) => set("description", v)}
            />
            <Field data-invalid={Boolean(errors.mapUrl)}>
              <FieldLabel htmlFor="loc-map">Lien de la carte</FieldLabel>
              <Input
                id="loc-map"
                className="h-11"
                inputMode="url"
                value={draft.mapUrl}
                onChange={(e) => set("mapUrl", e.target.value)}
                placeholder="https://maps.google.com/…"
              />
              <FieldDescription>Le lien « Partager » de Google Maps.</FieldDescription>
              {errors.mapUrl && <FieldError>{errors.mapUrl}</FieldError>}
            </Field>
            <Field>
              <FieldLabel>Photo</FieldLabel>
              <ImageField folder="locations" value={draft.image} onChange={(v) => set("image", v)} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="loc-visible" checked={draft.visible} onCheckedChange={(v) => set("visible", v)} />
              <FieldLabel htmlFor="loc-visible">Visible sur le site</FieldLabel>
            </Field>
          </FieldGroup>
          <SheetFooter className="sticky bottom-0 flex-row justify-end border-t bg-background/95 backdrop-blur">
            <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-11 min-w-36" disabled={busy}>
              {busy && <Spinner />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function LocationsView() {
  const queryClient = useQueryClient()
  const { webUrl } = useAppConfig()
  const locations = useQuery(orpc.admin.locations.list.queryOptions())
  const [editing, setEditing] = useState<LocationRow | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<LocationRow | null>(null)
  const remove = useMutation(
    orpc.admin.locations.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Atelier supprimé.")
        queryClient.invalidateQueries({ queryKey: orpc.admin.locations.key() })
      },
      onError: (error) => toast.error(errorMessage(error)),
    }),
  )
  const rows = locations.data ?? []
  const openSheet = (location: LocationRow | null) => {
    setEditing(location)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Ateliers"
        description="Les lieux affichés sur la page Atelier du site."
        actions={
          <Button size="lg" onClick={() => openSheet(null)}>
            <PlusIcon /> Nouvel atelier
          </Button>
        }
      />
      <PageBody>
        {locations.isPending && <LoadingRows rows={3} />}
        {locations.isError && <ErrorState error={locations.error} onRetry={() => locations.refetch()} />}
        {locations.data && rows.length === 0 && (
          <EmptyState title="Aucun atelier" description="Ajoutez une adresse pour l'afficher sur le site." />
        )}
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((location) => (
            <li key={location.id} className="frame flex gap-3 bg-card/70 p-3">
              {location.image ? (
                // biome-ignore lint/performance/noImgElement: thumbnail of an uploaded or static image
                <img src={imageSrc(location.image, webUrl)} alt="" className="size-20 shrink-0 border object-cover" />
              ) : (
                <div className="grid size-20 shrink-0 place-items-center border text-muted-foreground">
                  <MapPinIcon className="size-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl">{location.name}</p>
                <p className="text-muted-foreground">
                  {location.address}, {location.city} · {location.country}
                </p>
                {location.phone && <p className="tabular-nums">{location.phone}</p>}
                {!location.visible && (
                  <Badge variant="outline" className="mt-1">
                    Masqué
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon-lg" variant="ghost" aria-label="Modifier" onClick={() => openSheet(location)}>
                  <PencilSimpleIcon />
                </Button>
                <Button size="icon-lg" variant="ghost" aria-label="Supprimer" onClick={() => setToDelete(location)}>
                  <TrashIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </PageBody>
      <LocationSheet location={editing} open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(next) => !next && setToDelete(null)}
        title={`Supprimer ${toDelete?.name ?? ""} ?`}
        description="L'atelier disparaît du site."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => toDelete && remove.mutate({ id: toDelete.id })}
      />
    </>
  )
}
