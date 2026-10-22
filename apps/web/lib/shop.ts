const SORTS = ["featured", "price-asc", "price-desc", "newest"] as const

export type Sort = (typeof SORTS)[number]

export function parseSort(value: string | undefined): Sort {
  return SORTS.find((s) => s === value) ?? "featured"
}
