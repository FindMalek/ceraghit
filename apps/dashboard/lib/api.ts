import "server-only"
import type { AppRouterClient } from "@workspace/orpc/client"
import { isUnauthorized } from "@workspace/orpc/errors"
import { createServerClient } from "@workspace/orpc/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const api = createServerClient(async () => ({ cookie: (await cookies()).toString() }))

/** Admin read for a server component; an expired or missing session goes back to the login page. */
export async function admin<T>(call: (client: AppRouterClient["admin"]) => Promise<T>): Promise<T> {
  try {
    return await call(api.admin)
  } catch (error) {
    if (isUnauthorized(error)) redirect("/login")
    throw error
  }
}

export const publicApi = api.public

/** Public url of the landing page, for links and for images that live in its /public folder. */
export const webUrl = () => process.env.WEB_URL ?? "http://localhost:3000"
