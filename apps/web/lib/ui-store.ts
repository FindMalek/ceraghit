import { create } from "zustand"

interface UiState {
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  cartOpen: false,
  setCartOpen: (cartOpen) => set({ cartOpen }),
}))
