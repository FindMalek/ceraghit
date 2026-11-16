import { authRouter } from "./auth"
import { categoriesRouter, productsRouter } from "./catalog"
import { helpRouter } from "./help"
import { integrationsRouter } from "./integrations"
import { invoicesRouter } from "./invoices"
import { jobsRouter } from "./jobs"
import { mailRouter } from "./mail"
import { mediaRouter } from "./media"
import { ordersRouter, requestsRouter } from "./orders"
import { overview } from "./overview"
import { profileRouter, setupRouter } from "./profile"
import { locationsRouter, settingsRouter, uploadsRouter } from "./studio"

/** Every procedure here is built on `adminProcedure` (the `auth` login/logout excepted), see router.test.ts. */
export const adminRouter = {
  auth: authRouter,
  overview,
  products: productsRouter,
  categories: categoriesRouter,
  orders: ordersRouter,
  invoices: invoicesRouter,
  integrations: integrationsRouter,
  jobs: jobsRouter,
  mail: mailRouter,
  requests: requestsRouter,
  locations: locationsRouter,
  settings: settingsRouter,
  uploads: uploadsRouter,
  media: mediaRouter,
  help: helpRouter,
  profile: profileRouter,
  setup: setupRouter,
}
