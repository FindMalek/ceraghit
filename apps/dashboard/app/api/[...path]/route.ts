import { createProxy, DASHBOARD_ALLOWED } from "@workspace/sdk/proxy"

const proxy = createProxy(DASHBOARD_ALLOWED)

export const GET = proxy
export const POST = proxy
