import type { RouterClient } from "@orpc/server"
import { adminRouter } from "./admin"
import { publicRouter } from "./public"

/** One router, two namespaces: `public` for the website, `admin` for the dashboard (cookie session). */
export const appRouter = {
  public: publicRouter,
  admin: adminRouter,
}

export type AppRouter = typeof appRouter
export type AppRouterClient = RouterClient<AppRouter>
