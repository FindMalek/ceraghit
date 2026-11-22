import { countryName } from "./format"

interface Rule {
  /** Matched against the trimmed, upper-cased code. */
  pattern: RegExp
  example: string
  /** Aramex refuses an international parcel without one. */
  required: boolean
}

const digits = (n: number, example: string, required = true): Rule => ({
  pattern: new RegExp(`^\\d{${n}}$`),
  example,
  required,
})

/** Postcode format per shipping country. A country missing here has no postcode system (or none Aramex checks). */
export const POSTCODE_RULES: Record<string, Rule> = {
  TN: digits(4, "2000", false),
  DZ: digits(5, "16000"),
  MA: digits(5, "20000"),
  EG: digits(5, "11511"),
  TR: digits(5, "34000"),
  SA: { pattern: /^\d{5}(-\d{4})?$/, example: "12211", required: true },
  BE: digits(4, "1000"),
  FR: digits(5, "75001"),
  DE: digits(5, "10115"),
  IT: digits(5, "00118"),
  ES: digits(5, "28001"),
  PT: { pattern: /^\d{4}-\d{3}$/, example: "1000-001", required: true },
  NL: { pattern: /^\d{4} ?[A-Z]{2}$/, example: "1011 AB", required: true },
  LU: digits(4, "1009"),
  AT: digits(4, "1010"),
  CH: digits(4, "8001"),
  GB: { pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, example: "SW1A 1AA", required: true },
  IE: { pattern: /^[A-Z]\d{2} ?[A-Z\d]{4}$/, example: "D02 X285", required: false },
  SE: { pattern: /^\d{3} ?\d{2}$/, example: "111 22", required: true },
  DK: digits(4, "1050"),
  FI: digits(5, "00100"),
  NO: digits(4, "0150"),
  PL: { pattern: /^\d{2}-\d{3}$/, example: "00-001", required: true },
  CZ: { pattern: /^\d{3} ?\d{2}$/, example: "110 00", required: true },
  SK: { pattern: /^\d{3} ?\d{2}$/, example: "811 01", required: true },
  HU: digits(4, "1051"),
  RO: digits(6, "010011"),
  BG: digits(4, "1000"),
  GR: { pattern: /^\d{3} ?\d{2}$/, example: "105 57", required: true },
  HR: digits(5, "10000"),
  SI: digits(4, "1000"),
  EE: digits(5, "10111"),
  LV: { pattern: /^(LV-)?\d{4}$/, example: "LV-1050", required: true },
  LT: { pattern: /^(LT-)?\d{5}$/, example: "LT-01100", required: true },
  MT: { pattern: /^[A-Z]{3} ?\d{2,4}$/, example: "VLT 1117", required: true },
  CY: digits(4, "1010"),
  US: { pattern: /^\d{5}(-\d{4})?$/, example: "10001", required: true },
  CA: { pattern: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, example: "K1A 0B1", required: true },
}

/** A French message when the postcode is wrong for the country, null when it is fine (or the country has no rule). */
export function postcodeProblem(country: string, postalCode: string | null | undefined): string | null {
  const rule = POSTCODE_RULES[country]
  if (!rule) return null
  const value = (postalCode ?? "").trim().toUpperCase()
  const place = countryName(country, "fr")
  if (!value) return rule.required ? `Le code postal est obligatoire pour ${place} (exemple : ${rule.example}).` : null
  return rule.pattern.test(value) ? null : `Code postal invalide pour ${place} (exemple : ${rule.example}).`
}

/** The short hint shown under the postcode field, null for a country without a rule. */
export function postcodeHint(country: string): string | null {
  const rule = POSTCODE_RULES[country]
  if (!rule) return null
  return `${rule.required ? "Obligatoire" : "Facultatif"}, exemple : ${rule.example}`
}
