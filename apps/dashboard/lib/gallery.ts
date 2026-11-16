import type { Media, ProductImage } from "@workspace/sdk"

export interface GalleryItem {
  mediaId: string
  isMain: boolean
  /** The photo's own text, null to use the library's. */
  alt: { fr: string; en?: string; ar?: string } | null
  /** Preview data, not sent to the api. */
  image: string
  libraryAlt: { fr: string; en?: string; ar?: string } | null
  width: number | null
  height: number | null
}

export const GALLERY_MAX = 12

/** The main photo is always one of the list; with none flagged the first is. */
function withMain(list: GalleryItem[], mainId?: string): GalleryItem[] {
  const id = list.some((i) => i.mediaId === mainId) ? mainId : list.find((i) => i.isMain)?.mediaId
  const main = id ?? list[0]?.mediaId
  return list.map((i) => (i.isMain === (i.mediaId === main) ? i : { ...i, isMain: i.mediaId === main }))
}

export function moveImage(list: GalleryItem[], from: number, to: number): GalleryItem[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as GalleryItem)
  return next
}

export function setMain(list: GalleryItem[], mediaId: string): GalleryItem[] {
  return withMain(list, mediaId)
}

export function removeImage(list: GalleryItem[], index: number): GalleryItem[] {
  const next = list.filter((_, i) => i !== index)
  return withMain(next)
}

/** Keeps position and main flag, the alt override goes with the old photo. */
export function replaceImage(list: GalleryItem[], index: number, media: Media): GalleryItem[] {
  const old = list[index]
  if (!old || list.some((i, n) => n !== index && i.mediaId === media.id)) return list
  const next = [...list]
  next[index] = { ...fromMedia(media), isMain: old.isMain }
  return next
}

export function fromMedia(media: Media): GalleryItem {
  return {
    mediaId: media.id,
    isMain: false,
    alt: null,
    image: media.src,
    libraryAlt: media.alt,
    width: media.width,
    height: media.height,
  }
}

/** Adds the library picks that are not in the gallery yet, up to the maximum. */
export function addImages(list: GalleryItem[], picked: Media[]): GalleryItem[] {
  const next = [...list]
  for (const m of picked) {
    if (next.length >= GALLERY_MAX) break
    if (!next.some((i) => i.mediaId === m.id)) next.push(fromMedia(m))
  }
  return withMain(next)
}

export function toInputImages(list: GalleryItem[]) {
  return list.map(({ mediaId, isMain, alt }) => ({ mediaId, isMain, alt }))
}

/** A photo without a library row (legacy data) cannot be edited here, it is left out. */
export function productImageToItem(i: ProductImage): GalleryItem[] {
  if (!i.mediaId) return []
  return [
    {
      mediaId: i.mediaId,
      isMain: i.isMain,
      alt: i.altOverride,
      image: i.image,
      libraryAlt: i.altOverride ? null : i.alt,
      width: i.width,
      height: i.height,
    },
  ]
}
