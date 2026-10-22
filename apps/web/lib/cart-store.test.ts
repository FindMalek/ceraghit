import { beforeEach, expect, test } from "bun:test"
import type { Product } from "@workspace/sdk"
import { itemCount, subtotal, useCartStore } from "./cart-store"

const piece = (over: Partial<Product>): Product => ({
  id: "p1",
  ref: "0010",
  slug: "curda-seca-0010",
  category: { id: "c", slug: "curda-seca", name: { fr: "Curda Seca" } },
  title: { fr: "Curda Seca" },
  description: null,
  material: null,
  technique: null,
  dimensions: null,
  weightGrams: 1000,
  lengthCm: 20,
  widthCm: 20,
  heightCm: 10,
  prices: { TND: 40_000, EUR: 1_200 },
  stock: 3,
  unique: false,
  quoteOnly: false,
  featured: false,
  status: "published",
  images: [],
  ...over,
})

beforeEach(() => useCartStore.getState().clear())

test("quantities stop at the stock, a unique piece stays at one, totals are per currency", () => {
  const { add } = useCartStore.getState()
  add(piece({}), 5)
  add(piece({ id: "u1", ref: "0001", unique: true, stock: 1, prices: { TND: 1_000_000, EUR: 30_000 } }), 2)
  const { lines } = useCartStore.getState()
  expect(lines.find((l) => l.productId === "p1")?.quantity).toBe(3)
  expect(lines.find((l) => l.productId === "u1")?.quantity).toBe(1)
  expect(itemCount(lines)).toBe(4)
  expect(subtotal(lines, "TND")).toBe(3 * 40_000 + 1_000_000)
  expect(subtotal(lines, "EUR")).toBe(3 * 1_200 + 30_000)
})
