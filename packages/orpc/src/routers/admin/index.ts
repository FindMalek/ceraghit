import { authRouter } from "./auth"
import { categoriesRouter, productsRouter } from "./catalog"
import { ordersRouter, requestsRouter } from "./orders"
import { overview } from "./overview"
import { locationsRouter, settingsRouter, uploadsRouter } from "./studio"

/** Every procedure here is built on `adminProcedure` (the `auth` login/logout excepted), see router.test.ts. */
export const adminRouter = {
  auth: authRouter,
  overview,
  products: productsRouter,
  categories: categoriesRouter,
  orders: ordersRouter,
  requests: requestsRouter,
  locations: locationsRouter,
  settings: settingsRouter,
  uploads: uploadsRouter,
}
