import { z } from "zod"
import { localizedInput, localizedSchema } from "./schemas"

export const SITE_SLOT_KEYS = [
  "hero",
  "studio",
  "process",
  "logo",
  "og-home",
  "og-shop",
  "og-atelier",
  "og-custom",
  "texture",
] as const
export type SiteSlot = (typeof SITE_SLOT_KEYS)[number]
export const siteSlotSchema = z.enum(SITE_SLOT_KEYS)

interface SlotRule {
  label: string
  multiple: boolean
  min: number
  max: number
  /** Width/height the storefront crops to, null when any shape works. */
  aspect: string | null
}

const og = (label: string): SlotRule => ({ label, multiple: false, min: 0, max: 1, aspect: "1200/630" })

/** The one place describing each slot: the api validates against it, the dashboard labels and crops from it. */
export const SITE_SLOTS: Record<SiteSlot, SlotRule> = {
  hero: { label: "Photos d'accueil (diaporama)", multiple: true, min: 1, max: 8, aspect: "3/4" },
  studio: { label: "L'atelier", multiple: true, min: 0, max: 6, aspect: "4/5" },
  process: { label: "Étapes de fabrication", multiple: true, min: 0, max: 8, aspect: "1/1" },
  logo: { label: "Logo", multiple: false, min: 1, max: 1, aspect: "1/1" },
  "og-home": og("Image de partage : Accueil"),
  "og-shop": og("Image de partage : Boutique"),
  "og-atelier": og("Image de partage : Atelier"),
  "og-custom": og("Image de partage : Sur mesure"),
  texture: { label: "Texture de fond", multiple: false, min: 0, max: 1, aspect: null },
}

/** Pictures shipped with the web app: what an empty slot shows and what the seed fills the table with. */
export const DEFAULT_SITE_IMAGES: Record<SiteSlot, string[]> = {
  hero: ["0200-1", "0001-1", "0010-1", "0011-1"].map((n) => `/catalogue/${n}.webp`),
  studio: ["studio-interior", "studio-masks", "studio-lamps"].map((n) => `/catalogue/${n}.webp`),
  process: [1, 2, 3, 4].map((n) => `/catalogue/process-${n}.webp`),
  logo: ["/logo.webp"],
  "og-home": ["/catalogue/0200-1.webp"],
  "og-shop": ["/catalogue/lampes-collage.webp"],
  "og-atelier": ["/catalogue/studio-interior.webp"],
  "og-custom": ["/catalogue/0001-1.webp"],
  texture: ["/texture.webp"],
}

/** Intrinsic size of the bundled pictures the storefront lays out with fixed dimensions. */
export const DEFAULT_SITE_SIZES: Record<string, { width: number; height: number }> = {
  "/catalogue/studio-interior.webp": { width: 1079, height: 1560 },
  "/catalogue/studio-masks.webp": { width: 662, height: 956 },
  "/catalogue/studio-lamps.webp": { width: 680, height: 984 },
}

/** Admin view of one slot entry. */
export const siteImageSchema = z.object({
  id: z.string(),
  slot: siteSlotSchema,
  mediaId: z.string(),
  /** Value `imageSrc()` accepts. */
  image: z.string(),
  /** The override, null when the media's own alt applies. */
  alt: localizedSchema.nullable(),
  visible: z.boolean(),
  position: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
})
export const siteImagesSchema = z.record(siteSlotSchema, z.array(siteImageSchema))

/** What the storefront reads: no ids, alt already resolved (override, then the media's alt). */
export const publicSiteImageSchema = z.object({
  image: z.string(),
  alt: localizedSchema.nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
})
export const publicSiteImagesSchema = z.record(siteSlotSchema, z.array(publicSiteImageSchema))

/** Per-slot limits (`SITE_SLOTS`) are checked by the api, which answers with a readable message. */
export const siteSlotInputSchema = z.object({
  slot: siteSlotSchema,
  images: z
    .array(
      z.object({
        mediaId: z.string().uuid(),
        alt: localizedInput(200).nullable().optional(),
        visible: z.boolean().default(true),
      }),
    )
    .max(8),
})
export type SiteSlotInput = z.output<typeof siteSlotInputSchema>
export type PublicSiteImages = z.output<typeof publicSiteImagesSchema>
