import { type Media, SITE_SLOTS, type SiteSlot } from "@workspace/sdk"

export interface SlotItem {
  mediaId: string
  image: string
  alt: { fr: string; en?: string; ar?: string } | null
  libraryAlt: { fr: string; en?: string; ar?: string } | null
  visible: boolean
  width: number | null
  height: number | null
}

export const slotItemFromMedia = (m: Media): SlotItem => ({
  mediaId: m.id,
  image: m.src,
  alt: null,
  libraryAlt: m.alt,
  visible: true,
  width: m.width,
  height: m.height,
})

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** The readable reason a slot cannot be saved, null when it can. */
export function slotError(slot: SiteSlot, items: SlotItem[]): string | null {
  const rule = SITE_SLOTS[slot]
  if (items.length > rule.max) return `${rule.max} photos au maximum.`
  if (items.filter((i) => i.visible).length < rule.min)
    return slot === "hero"
      ? "Gardez au moins une photo visible dans le diaporama."
      : "Gardez au moins une photo visible."
  return null
}

/** True when the picture's shape differs from the slot's by more than a quarter, so the site crops it. */
export function willCrop(slot: SiteSlot, item: Pick<SlotItem, "width" | "height">): boolean {
  const aspect = SITE_SLOTS[slot].aspect
  if (!aspect || !item.width || !item.height) return false
  const [w, h] = aspect.split("/").map(Number) as [number, number]
  const ratio = item.width / item.height / (w / h)
  return ratio > 1.25 || ratio < 0.75
}
