import type { Localized } from "../schema"

/**
 * English and Arabic for the catalogue texts, keyed by the French text the PDF gives. The studio reviews them in the
 * dashboard; anything not listed stays French only and the storefront falls back to it.
 */
const TRANSLATIONS: Record<string, { en: string; ar: string }> = {
  // categories and titles
  "Curda Seca": { en: "Curda Seca", ar: "كوردا سيكا" },
  "Lampe votive": { en: "Votive lamp", ar: "مصباح نذري" },
  "Bas-relief": { en: "Bas-relief", ar: "نحت بارز" },
  "Haut-relief & pièces uniques": { en: "High relief & unique pieces", ar: "نحت بارز عالٍ وقطع فريدة" },
  Medusa: { en: "Medusa", ar: "ميدوزا" },
  "Amor Dominator": { en: "Amor Dominator", ar: "أمور المهيمن" },
  "Neptune triomphant": { en: "Triumphant Neptune", ar: "نبتون المنتصر" },
  "Bas-relief en céramique": { en: "Ceramic bas-relief", ar: "نحت بارز من السيراميك" },
  "Masque de Carthage": { en: "Mask of Carthage", ar: "قناع قرطاج" },
  "Haut-relief": { en: "High relief", ar: "نحت بارز عالٍ" },
  "Fontaine andalouse": { en: "Andalusian fountain", ar: "نافورة أندلسية" },
  "L'Homme de Vitruve": { en: "Vitruvian Man", ar: "الرجل الفيتروفي" },
  "Sculpture en ronde-bosse": { en: "Sculpture in the round", ar: "منحوتة مجسّمة" },
  // materials
  "Céramique - Terre cuite émaillée": { en: "Ceramic - glazed terracotta", ar: "سيراميك - طين مشوي مطلي" },
  "Céramique - Terre cuite": { en: "Ceramic - terracotta", ar: "سيراميك - طين مشوي" },
  "Pierre, granit, marbre, terre cuite": {
    en: "Stone, granite, marble, terracotta",
    ar: "حجر وغرانيت ورخام وطين مشوي",
  },
  "Terre cuite émaillée": { en: "Glazed terracotta", ar: "طين مشوي مطلي" },
  "Terre cuite": { en: "Terracotta", ar: "طين مشوي" },
  // techniques
  "Modelé à la main": { en: "Hand-modelled", ar: "مشكّل يدويًا" },
  "Modelé et vieilli à la main, effet ancien": {
    en: "Hand-modelled and aged, antique effect",
    ar: "مشكّل ومعتّق يدويًا بمظهر قديم",
  },
  "Bas-relief modelé à la main": { en: "Hand-modelled bas-relief", ar: "نحت بارز مشكّل يدويًا" },
  "Taille directe": { en: "Direct carving", ar: "نحت مباشر" },
  Modelage: { en: "Modelling", ar: "تشكيل بالطين" },
  // descriptions
  "Tous les modèles de lampes votives sont disponibles en terre cuite non émaillée, 5 € de moins que la même pièce émaillée.":
    {
      en: "All votive lamp models are available in unglazed terracotta, 5 € less than the same glazed piece.",
      ar: "جميع موديلات المصابيح النذرية متوفرة من الطين المشوي غير المطلي، بسعر أقل بـ 5 يورو من القطعة المطلية نفسها.",
    },
  "Sculpture céramique.": { en: "Ceramic sculpture.", ar: "منحوتة من السيراميك." },
  "Bas-relief sur commande, thème au choix.": {
    en: "Bas-relief made to order, theme of your choice.",
    ar: "نحت بارز عند الطلب، بموضوع من اختيارك.",
  },
  "Reproduction fidèle de la Dame d'Elche, conservée au Musée archéologique national de Madrid, Espagne.": {
    en: "Faithful reproduction of the Lady of Elche, kept at the National Archaeological Museum in Madrid, Spain.",
    ar: "نسخة مطابقة لسيدة إلتشي المحفوظة في المتحف الأثري الوطني بمدريد، إسبانيا.",
  },
  // variants
  Émaillée: { en: "Glazed", ar: "مطلية" },
  "Terre cuite non émaillée": { en: "Unglazed terracotta", ar: "طين مشوي غير مطلي" },
}

/** `{ fr, en, ar }` for a French catalogue text; French only when there is no translation yet. */
export function localize(fr: string): Localized {
  const found = TRANSLATIONS[fr]
  return found ? { fr, en: found.en, ar: found.ar } : { fr }
}
