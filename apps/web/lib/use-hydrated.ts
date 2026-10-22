import { useSyncExternalStore } from "react"

const subscribe = (): (() => void) => () => {}

/** False on the server and during hydration, true afterwards: for values that only exist in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
