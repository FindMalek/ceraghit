import { catalogRouter } from "./catalog"
import { ordersRouter, requestsRouter } from "./orders"

/** Everything the storefront may call. No procedure here reads a session. */
export const publicRouter = {
  catalog: catalogRouter,
  orders: ordersRouter,
  requests: requestsRouter,
}
