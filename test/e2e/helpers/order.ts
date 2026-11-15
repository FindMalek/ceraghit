import type { APIRequestContext, Page } from "@playwright/test"
import { E2E } from "../env"
import { type AppLocale, localePath } from "./locale"
import { t } from "./messages"

interface ApiProduct {
  id: string
  slug: string
  stock: number
  unique: boolean
  quoteOnly: boolean
  variants: { id: string; stock: number }[]
}

export interface PlacedOrder {
  number: string
  token: string
  /** Where the browser ended up: the order page for cod and transfer, the demo gateway for online. */
  url: string
}

/** COD is Tunisia only and transfer is abroad only, so the country is part of the method. */
export type OrderChoice =
  | { method: "cod"; country?: "TN" }
  | { method: "transfer"; country: "FR" | "DE" | "BE" | "IT" | "ES" | "CH" }
  | { method: "online"; country?: "TN" | "FR" }

export type PlaceOrderOptions = { locale: AppLocale; productSlug?: string } & OrderChoice

const CUSTOMER = {
  customerName: "Test Client",
  email: "client@e2e.local",
  phone: "+21620000000",
  city: "Tunis",
  address: "1 rue de test",
}

/** The in stock piece with the most stock, so a run of orders never sells it out. */
export async function findOrderableProduct(request: APIRequestContext): Promise<ApiProduct> {
  const res = await request.get(`${E2E.apiUrl}/v1/products`)
  if (!res.ok()) throw new Error(`products ${res.status()}`)
  const list = (await res.json()) as ApiProduct[]
  const candidates = list.filter((p) => !p.unique && !p.quoteOnly && p.stock > 0).sort((a, b) => b.stock - a.stock)
  const product = candidates[0]
  if (!product) throw new Error("no orderable product in the demo seed")
  return product
}

/** Browser flow: product page, add to cart, checkout, submit. Returns the order number and its public token. */
export async function placeOrder(page: Page, options: PlaceOrderOptions): Promise<PlacedOrder> {
  const { locale } = options
  const country = options.country ?? "TN"
  const slug = options.productSlug ?? (await findOrderableProduct(page.request)).slug

  if (country !== "TN") {
    await page.context().addCookies([{ name: "ceraghit_currency", value: "EUR", url: E2E.webUrl }])
  }
  await page.goto(`${E2E.webUrl}${localePath(locale, `/product/${slug}`)}`)
  await page.getByRole("button", { name: t(locale, "product.add") }).click()
  await page.goto(`${E2E.webUrl}${localePath(locale, "/checkout")}`)

  await page.getByLabel(t(locale, "checkout.name")).fill(CUSTOMER.customerName)
  await page.getByLabel(t(locale, "checkout.email")).fill(CUSTOMER.email)
  await page.getByLabel(t(locale, "checkout.phone")).fill(CUSTOMER.phone)
  await page.getByLabel(t(locale, "checkout.country"), { exact: true }).selectOption(country)
  await page.getByLabel(t(locale, "checkout.city")).fill(CUSTOMER.city)
  await page.getByLabel(t(locale, "checkout.address"), { exact: true }).fill(CUSTOMER.address)
  await page.getByRole("radio", { name: t(locale, METHOD_KEY[options.method]) }).check()
  await page.getByRole("checkbox").check()

  const submit = page.getByRole("button", {
    name: new RegExp(
      `^(${escapeRegex(t(locale, "checkout.placeOrder"))}|${escapeRegex(t(locale, "checkout.pay").split("{")[0] ?? "")})`,
    ),
  })
  await submit.click()

  await page.waitForURL(/\/(order\/[^/?]+\?t=|checkout\/demo\?)/)
  const url = page.url()
  const number =
    options.method === "online"
      ? (new URL(url).searchParams.get("order") ?? "")
      : (new URL(url).pathname.split("/").pop() ?? "")
  const token =
    options.method === "online"
      ? await page.evaluate(
          (n) => (JSON.parse(localStorage.getItem("ceraghit-order-tokens") ?? "{}") as Record<string, string>)[n] ?? "",
          number,
        )
      : (new URL(url).searchParams.get("t") ?? "")
  if (!number || !token) throw new Error(`could not read the order from ${url}`)
  return { number, token, url }
}

/** Creates an order over the public REST api, for specs that only need one to exist. */
export async function createOrderViaApi(
  request: APIRequestContext,
  input: {
    method?: "cod" | "transfer" | "online"
    country?: string
    currency?: "TND" | "EUR"
    locale?: AppLocale
  } = {},
): Promise<PlacedOrder> {
  const product = await findOrderableProduct(request)
  const country = input.country ?? "TN"
  const res = await request.post(`${E2E.apiUrl}/v1/orders`, {
    data: {
      items: [{ productId: product.id, variantId: product.variants.find((v) => v.stock > 0)?.id, quantity: 1 }],
      currency: input.currency ?? (country === "TN" ? "TND" : "EUR"),
      locale: input.locale ?? "fr",
      paymentMethod: input.method ?? (country === "TN" ? "cod" : "transfer"),
      country,
      ...CUSTOMER,
    },
  })
  if (!res.ok()) throw new Error(`create order ${res.status()} ${await res.text()}`)
  const created = (await res.json()) as { number: string; token: string; payUrl: string }
  return { number: created.number, token: created.token, url: created.payUrl }
}

const METHOD_KEY = {
  online: "checkout.methodOnline",
  cod: "checkout.methodCod",
  transfer: "checkout.methodTransfer",
} as const

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
