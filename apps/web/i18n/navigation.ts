import { createNavigation } from "next-intl/navigation"
import { type ComponentProps, createElement } from "react"
import { routing } from "./routing"

const navigation = createNavigation(routing)

export const { redirect, usePathname, useRouter, getPathname } = navigation

// Every page is rendered per request, so each prefetched link costs function runs nobody asked for (a /shop view ran
// about 50). Pass `prefetch` to opt one link back in.
export function Link({ prefetch = false, ...props }: ComponentProps<typeof navigation.Link>) {
  return createElement(navigation.Link, { ...props, prefetch })
}
