import type { Currency, Product } from "@workspace/sdk"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export interface CartLine {
  productId: string
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
  add: (product: Product, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
}

export function maxQuantity(line: Pick<CartLine, "unique" | "stock">): number {
  return line.unique ? 1 : Math.max(1, Math.min(line.stock, 20))
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (product, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.productId === product.id)
          const base = existing ?? {
            productId: product.id,
            ref: product.ref,
            slug: product.slug,
            title: product.title,
            image: product.images[0]?.image ?? null,
            prices: product.prices,
            unique: product.unique,
            stock: product.stock,
            quantity: 0,
          }
          const next = {
            ...base,
            prices: product.prices,
            stock: product.stock,
            quantity: Math.min(base.quantity + quantity, maxQuantity(base)),
          }
          return {
            lines: existing ? state.lines.map((l) => (l.productId === product.id ? next : l)) : [...state.lines, next],
          }
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.productId === productId ? { ...l, quantity: Math.max(1, Math.min(quantity, maxQuantity(l))) } : l,
          ),
        })),
      remove: (productId) => set((state) => ({ lines: state.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "ceraghit-cart", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
)

/** Totals are per currency: the two are never added together. */
export function subtotal(lines: CartLine[], currency: Currency): number {
  return lines.reduce((sum, l) => sum + l.prices[currency] * l.quantity, 0)
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}
