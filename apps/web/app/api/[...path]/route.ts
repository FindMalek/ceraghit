import { createProxy, WEB_ALLOWED } from "@workspace/sdk/proxy"

const proxy = createProxy(WEB_ALLOWED)

export const GET = proxy
export const POST = proxy
