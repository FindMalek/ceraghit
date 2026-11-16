import { aiRouter } from "./ai"
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
import { shippingRouter } from "./shipping"
import { siteRouter } from "./site"
import { locationsRouter, settingsRouter, uploadsRouter } from "./studio"

/** Every procedure here is built on `adminProcedure` (the `auth` login/logout excepted), see router.test.ts. */
export const adminRouter = {
  auth: authRouter,
  ai: aiRouter,
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
  shipping: shippingRouter,
  uploads: uploadsRouter,
  media: mediaRouter,
  site: siteRouter,
  help: helpRouter,
  profile: profileRouter,
  setup: setupRouter,
}
