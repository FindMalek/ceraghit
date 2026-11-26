import { timingSafeEqual } from "node:crypto"
import { revalidateTag } from "next/cache"
import { CATALOG_TAG } from "@/lib/cache-tag"

/** Called by the api after a write. Bearer `PROXY_SECRET`; without one configured the route does not exist. */
export function POST(request: Request) {
  const secret = process.env.PROXY_SECRET
  if (!secret) return new Response(null, { status: 404 })
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const wanted = Buffer.from(`Bearer ${secret}`)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return new Response(null, { status: 401 })
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return new Response(null, { status: 204 })
}
