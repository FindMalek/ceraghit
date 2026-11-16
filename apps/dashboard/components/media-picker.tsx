"use client"

import type { Media } from "@workspace/sdk"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useCallback, useState } from "react"
import { MediaBrowser } from "@/components/media-library"
import { MediaUploadZone } from "@/components/media-upload-zone"
import { DEFAULT_MEDIA_QUERY, type MediaQuery } from "@/lib/media-query"

export interface MediaPickerProps {
  open: boolean
  onOpenChange(open: boolean): void
  multiple?: boolean
  max?: number
  selectedIds?: string[]
  title?: string
  onSelect(media: Media[]): void
}

function PickerBody({
  multiple,
  max,
  selectedIds = [],
  onSelect,
  onOpenChange,
  footer: Footer,
}: MediaPickerProps & {
  footer: React.ComponentType<{ children: React.ReactNode }>
}) {
  const [query, setQuery] = useState<MediaQuery>(DEFAULT_MEDIA_QUERY)
  const [picked, setPicked] = useState<Media[]>([])
  const [ids, setIds] = useState<string[]>(selectedIds)
  const [tab, setTab] = useState("library")
  const [known, setKnown] = useState<Media[]>([])
  const onItems = useCallback((items: Media[]) => setKnown(items), [])
  const choose = (list: Media[]) => {
    onSelect(list)
    onOpenChange(false)
  }
  const toggle = (media: Media) => {
    setPicked((p) => (p.some((m) => m.id === media.id) ? p : [...p, media]))
    setIds((current) =>
      !multiple
        ? [media.id]
        : current.includes(media.id)
          ? current.filter((id) => id !== media.id)
          : max && current.length >= max
            ? current
            : [...current, media.id],
    )
  }
  const resolve = () => {
    const pool = [...known, ...picked]
    return ids.map((id) => pool.find((m) => m.id === id)).filter((m): m is Media => Boolean(m))
  }
  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 overflow-y-auto px-4">
        <TabsList>
          <TabsTrigger value="library">Bibliothèque</TabsTrigger>
          <TabsTrigger value="upload">Envoyer</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="pt-3">
          <MediaBrowser
            query={query}
            onQueryChange={setQuery}
            selectedIds={ids}
            selectable
            onActivate={toggle}
            onToggle={toggle}
            onChoose={multiple ? undefined : (media) => choose([media])}
            onItems={onItems}
          />
        </TabsContent>
        <TabsContent value="upload" className="pt-3">
          <MediaUploadZone
            onUploaded={(media) => {
              setPicked((p) => [...p, ...media])
              setIds((current) =>
                multiple ? [...current, ...media.map((m) => m.id)].slice(0, max ?? 99) : [media[0]?.id ?? ""],
              )
              setTab("library")
            }}
          />
        </TabsContent>
      </Tabs>
      <Footer>
        <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button className="h-11" disabled={ids.length === 0} onClick={() => choose(resolve())}>
          {multiple ? `Choisir (${ids.length})` : "Choisir"}
        </Button>
      </Footer>
    </>
  )
}

/** Choose photos from the library: dialog on desktop, bottom sheet on a phone. */
export function MediaPicker(props: MediaPickerProps) {
  const mobile = useIsMobile()
  const title = props.title ?? "Choisir dans la médiathèque"
  const description = "Cherchez une photo, ou envoyez-en de nouvelles."
  if (mobile) {
    return (
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent className="h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
          </DrawerHeader>
          <PickerBody
            {...props}
            footer={({ children }) => (
              <DrawerFooter className="flex-row justify-end border-t pb-[env(safe-area-inset-bottom)]">
                {children}
              </DrawerFooter>
            )}
          />
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <PickerBody {...props} footer={({ children }) => <DialogFooter>{children}</DialogFooter>} />
      </DialogContent>
    </Dialog>
  )
}
