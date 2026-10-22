import type { Currency, Product, ProductVariant } from "@workspace/sdk"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export interface CartLine {
  productId: string
  /** Set when the piece has options (glazed or not): the line is that option, with its own price and stock. */
  variantId: string | null
  variantLabel: ProductVariant["label"] | null
  ref: string
  slug: string
  title: Product["title"]
  image: string | null
  prices: Product["prices"]
  unique: boolean
  /** Stock when the piece was added, so the cart can't ask for more than exists. */
  stock: number
  quantity: number
}

interface CartState {
  lines: CartLine[]
  add: (product: Product, quantity?: number, variant?: ProductVariant) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
}

/** One cart line per piece and option. */
export const lineKey = (l: Pick<CartLine, "productId" | "variantId">): string => `${l.productId}:${l.variantId ?? ""}`

export function maxQuantity(line: Pick<CartLine, "unique" | "stock">): number {
  return line.unique ? 1 : Math.max(1, Math.min(line.stock, 20))
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (product, quantity = 1, variant) =>
        set((state) => {
          const key = lineKey({ productId: product.id, variantId: variant?.id ?? null })
          const existing = state.lines.find((l) => lineKey(l) === key)
          const base = existing ?? {
            productId: product.id,
            variantId: variant?.id ?? null,
            variantLabel: variant?.label ?? null,
            ref: product.ref,
            slug: product.slug,
            title: product.title,
            image: product.images[0]?.image ?? null,
            prices: (variant ?? product).prices,
            unique: product.unique,
            stock: (variant ?? product).stock,
            quantity: 0,
          }
          const next = {
            ...base,
            prices: (variant ?? product).prices,
            stock: (variant ?? product).stock,
            quantity: Math.min(base.quantity + quantity, maxQuantity({ ...base, stock: (variant ?? product).stock })),
          }
          return {
            lines: existing ? state.lines.map((l) => (lineKey(l) === key ? next : l)) : [...state.lines, next],
          }
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            lineKey(l) === key ? { ...l, quantity: Math.max(1, Math.min(quantity, maxQuantity(l))) } : l,
          ),
        })),
      remove: (key) => set((state) => ({ lines: state.lines.filter((l) => lineKey(l) !== key) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "ceraghit-cart",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { lines?: Omit<CartLine, "variantId" | "variantLabel">[] }
        return { lines: (state.lines ?? []).map((l) => ({ ...l, variantId: null, variantLabel: null })) }
      },
    },
  ),
)

/** Totals are per currency: the two are never added together. */
export function subtotal(lines: CartLine[], currency: Currency): number {
  return lines.reduce((sum, l) => sum + l.prices[currency] * l.quantity, 0)
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}
