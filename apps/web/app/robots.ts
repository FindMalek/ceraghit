import type { MetadataRoute } from "next"
import { SITE } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  if (!SITE.isProduction) return { rules: { userAgent: "*", disallow: "/" } }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/checkout", "/order/", "/*/checkout", "/*/order/", "/*/cart"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
