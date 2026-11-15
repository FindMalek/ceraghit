import type { ReactNode } from "react"

/** Back and next buttons pinned to the bottom of the screen so a thumb always reaches them. */
export function WizardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-col-reverse gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:justify-between">
      {children}
    </div>
  )
}
