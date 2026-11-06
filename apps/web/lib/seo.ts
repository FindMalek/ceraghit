import { imageSrc } from "@workspace/sdk"
import type { Metadata } from "next"
import { ENABLED_LOCALES } from "./locales"
import { SITE } from "./site"

/** French lives at the root, every other locale under its prefix (`localePrefix: "as-needed"`). */
export function localizedPath(locale: string, path: string): string {
  const prefix = locale === "fr" ? "" : `/${locale}`
  return `${prefix}${path}` || "/"
}

export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE.url}${pathOrUrl}`
}

export function absoluteImage(image: string): string {
  return absoluteUrl(imageSrc(image))
}

interface PageMeta {
  locale: string
  /** Path without locale prefix, "" for the home page. */
  path: string
  title?: Metadata["title"]
  description?: string
}

/** Title, description, canonical and language alternates for one page. Its card comes from the segment's opengraph-image. */
export function pageMetadata({ locale, path, title, description }: PageMeta): Metadata {
  const canonical = absoluteUrl(localizedPath(locale, path))
  const languages = Object.fromEntries(ENABLED_LOCALES.map((l) => [l, absoluteUrl(localizedPath(l, path))]))
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: typeof title === "string" ? title : title && "absolute" in title ? title.absolute : undefined,
      description,
      url: canonical,
    },
  }
}
