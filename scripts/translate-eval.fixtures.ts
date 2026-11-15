import fr from "../apps/web/messages/fr.json" with { type: "json" }
import { CATALOGUE } from "../packages/db/src/seed/catalogue"
import { localize } from "../packages/db/src/seed/translations"
import type { EvalSample } from "../packages/orpc/src/lib/translate/eval"

const SENTENCES = [
  "Bol en grès façonné à la main, émail bleu cobalt sur fond crème.",
  "Vase tourné au tour, cuit à 1280 °C, finition mate.",
  "Chaque pièce est unique : de légères variations de couleur font partie de son charme.",
  "Assiette plate Ø 27 cm, compatible lave-vaisselle et micro-ondes.",
  "Collection Jasmin – Réf. CG-112, motifs peints au pinceau inspirés de Nabeul.",
  "Engobe blanc appliqué à la main, puis émail transparent brillant.",
  "Tasse en faïence de 250 ml, anse modelée, intérieur émaillé alimentaire.",
  "Cuisson raku : les craquelures noires apparaissent lors de l'enfumage.",
  "Pièce signée par Sabri Ghit, Ceraghit Creation, Tunisie.",
  "À laver à la main de préférence pour préserver l'éclat de l'émail doré.",
]

/** Same limits as the dashboard product form. */
const MAX_LENGTH = { title: 120, description: 3000, material: 200, technique: 200, sentence: 3000, ui: 500 }

function unique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function withReference(text: string): EvalSample["reference"] {
  const found = localize(text)
  return found.en && found.ar ? { en: found.en, ar: found.ar } : undefined
}

export function collectSamples(): EvalSample[] {
  const catalogue = (field: keyof typeof MAX_LENGTH, texts: string[]): EvalSample[] =>
    texts.map((text, index) => ({
      id: `${field}-${index + 1}`,
      field,
      maxLength: MAX_LENGTH[field],
      fr: text,
      reference: withReference(text),
    }))
  const descriptions = unique(CATALOGUE.map((product) => product.description)).sort((a, b) => b.length - a.length)
  const ui = [fr.home.customText, fr.atelier.lead]
  return [
    ...catalogue("sentence", SENTENCES).map((sample) => ({ ...sample, reference: undefined })),
    ...catalogue("title", unique(CATALOGUE.map((product) => product.title)).slice(0, 4)),
    ...catalogue("description", descriptions),
    ...catalogue("material", unique(CATALOGUE.map((product) => product.material))),
    ...catalogue("technique", unique(CATALOGUE.map((product) => product.technique))),
    ...ui.map((text, index) => ({ id: `ui-${index + 1}`, field: "ui", maxLength: MAX_LENGTH.ui, fr: text })),
  ]
}
