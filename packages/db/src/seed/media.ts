import type { Localized } from "../schema"

/** Alt text and tags for the first catalogue pictures, so search and sort have something to show. */
export const DEMO_MEDIA_TAGS: { alt: Localized; tags: string[] }[] = [
  { alt: { fr: "Vase noir émaillé", en: "Glazed black vase", ar: "مزهرية سوداء مطلية" }, tags: ["vase", "noir"] },
  { alt: { fr: "Vase noir brillant", en: "Glossy black vase", ar: "مزهرية سوداء لامعة" }, tags: ["vase", "noir"] },
  { alt: { fr: "Lampe en céramique", en: "Ceramic lamp", ar: "مصباح من السيراميك" }, tags: ["lampe"] },
  { alt: { fr: "Lampe de table noire", en: "Black table lamp", ar: "مصباح طاولة أسود" }, tags: ["lampe", "noir"] },
  { alt: { fr: "Grand vase décoratif", en: "Large decorative vase", ar: "مزهرية كبيرة للزينة" }, tags: ["vase"] },
]
