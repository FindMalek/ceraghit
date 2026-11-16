import type { Localized } from "../schema"

interface DemoMedia {
  alt: Localized
  tags: string[]
}

/** Demo alt text and tags, by the product ref whose first picture they describe. */
export const DEMO_MEDIA_BY_REF: Record<string, DemoMedia> = {
  "0010": { alt: { fr: "Curda Seca", en: "Curda Seca piece", ar: "قطعة كوردا سيكا" }, tags: ["curda-seca"] },
  "0200": { alt: { fr: "Lampe votive", en: "Votive lamp", ar: "مصباح نذري" }, tags: ["lampe"] },
  "0201": { alt: { fr: "Lampe votive", en: "Votive lamp", ar: "مصباح نذري" }, tags: ["lampe"] },
  "0050": { alt: { fr: "Medusa en bas-relief", en: "Medusa bas-relief", ar: "ميدوزا نحت بارز" }, tags: ["bas-relief"] },
  "0002": {
    alt: { fr: "Fontaine andalouse", en: "Andalusian fountain", ar: "نافورة أندلسية" },
    tags: ["haut-relief"],
  },
}

/** A picture uploaded but not attached to anything, so the "unused" filter has something to show. */
export const DEMO_UNUSED_MEDIA = {
  key: "demo/media/atelier-inutilise.webp",
  filename: "atelier-inutilise.webp",
  alt: { fr: "Atelier", en: "Studio", ar: "الورشة" } as Localized,
  tags: ["atelier"],
}

/** Demo piece whose main photo is its second one, to show that the main photo comes first on the storefront. */
export const DEMO_MAIN_SECOND_REF = "0011"
