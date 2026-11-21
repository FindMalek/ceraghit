"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@workspace/orpc/react"
import { searchTutorials, TUTORIALS, type TutorialLinks, tutorialLinksSchema, youtubeId } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import { showError } from "@workspace/ui/components/error-banner"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { type FormEvent, useState } from "react"
import { errorMessage } from "@/lib/errors"

type Device = "desktop" | "mobile"
type Drafts = Record<string, Record<Device, string>>

const DEVICES: { key: Device; label: string }[] = [
  { key: "desktop", label: "Ordinateur" },
  { key: "mobile", label: "Téléphone" },
]

const EDITABLE = TUTORIALS.filter((t) => t.status !== "soon")

const toDrafts = (links: TutorialLinks): Drafts =>
  Object.fromEntries(
    EDITABLE.map((t) => [
      t.id,
      {
        desktop: links[t.id]?.desktop ? `https://youtu.be/${links[t.id]?.desktop}` : "",
        mobile: links[t.id]?.mobile ? `https://youtu.be/${links[t.id]?.mobile}` : "",
      },
    ]),
  )

/** Optional: a YouTube link replaces the hosted file of a video, until the owner clears it. */
export function TutorialLinksEditor({
  links,
  open,
  onOpenChange,
}: {
  links: TutorialLinks
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(links))
  const [errors, setErrors] = useState<Record<string, true>>({})
  const [filter, setFilter] = useState("")
  const shown = searchTutorials(EDITABLE, { query: filter })
  const save = useMutation(
    orpc.admin.help.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.admin.help.key() })
        onOpenChange(false)
      },
      onError: (error) => showError(errorMessage(error)),
    }),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, true> = {}
    const value: TutorialLinks = {}
    for (const t of EDITABLE) {
      const entry = { desktop: null as string | null, mobile: null as string | null }
      for (const { key } of DEVICES.filter(({ key }) => t.devices.includes(key))) {
        const text = drafts[t.id]![key].trim()
        const id = text ? youtubeId(text) : null
        if (text && !id) found[`video-${t.id}-${key}`] = true
        entry[key] = id
      }
      if (entry.desktop || entry.mobile) value[t.id] = entry
    }
    setErrors(found)
    const parsed = tutorialLinksSchema.safeParse(value)
    if (Object.keys(found).length || !parsed.success) return
    save.mutate(parsed.data)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b pr-14">
            <SheetTitle className="text-xl">Liens YouTube</SheetTitle>
            <SheetDescription>
              Facultatif. Un lien YouTube remplace la vidéo hébergée de la fiche. Laissez vide pour garder la vidéo
              hébergée.
            </SheetDescription>
          </SheetHeader>
          <div className="border-b p-4">
            <InputGroup className="h-11">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Chercher une vidéo à modifier"
                placeholder="Chercher une vidéo"
                autoComplete="off"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </InputGroup>
          </div>
          <FieldGroup className="min-h-0 flex-1 gap-6 overflow-y-auto p-4">
            {shown.length === 0 && <p className="text-muted-foreground">Aucune vidéo ne correspond.</p>}
            {shown.map((t) => (
              <FieldSet key={t.id} className="gap-3">
                <FieldLegend className="font-medium">
                  <span className="text-primary tabular-nums">{t.id.slice(0, 2)}</span> · {t.title}
                </FieldLegend>
                {DEVICES.filter(({ key }) => t.devices.includes(key)).map(({ key, label }) => {
                  const name = `video-${t.id}-${key}`
                  return (
                    <Field key={key} data-invalid={errors[name] || undefined}>
                      <FieldLabel htmlFor={name}>{label}</FieldLabel>
                      <Input
                        id={name}
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://youtu.be/…"
                        className="h-11"
                        aria-invalid={errors[name] || undefined}
                        value={drafts[t.id]![key]}
                        onChange={(event) => {
                          const text = event.target.value
                          setDrafts((d) => ({ ...d, [t.id]: { ...d[t.id]!, [key]: text } }))
                          if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest)
                        }}
                      />
                      {errors[name] && <FieldError>Lien YouTube non reconnu</FieldError>}
                    </Field>
                  )
                })}
              </FieldSet>
            ))}
          </FieldGroup>
          <SheetFooter className="flex-row justify-end border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-11 min-w-36" disabled={save.isPending}>
              {save.isPending && <Spinner />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
