import { E2E } from "../../env"
import { expect, test } from "../../fixtures"

const FORBIDDEN_KEY =
  /(taxid|iban|bank|holder|password|secret|apikey|api_key|privatekey|adminnote|hash)|^(rib|bic)$|[a-z_](rib|bic)$/i
/** Whole IBANs of any length, with or without spaces, so a 27-character one is not missed. */
const IBAN_PLAIN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/
const IBAN_SPACED = /\b[A-Z]{2}\d{2}(?:\s[A-Z0-9]{3,4}){3,7}\b/
const BEARER = /bearer\s+[\w.~+/=-]{12,}/i
const looksLikeIban = (text: string): boolean => IBAN_PLAIN.test(text) || IBAN_SPACED.test(text)

/** The matricule fiscal is public on purpose (legal notice), see `publicShopProfileSchema`. Nothing else is. */
const PUBLIC_ON_PURPOSE = new Set(["/settings.profile.taxId"])
const PUBLIC_PAGES = ["/", "/shop", "/atelier", "/custom", "/en", "/ar"]

function walk(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) walk(item, `${path}[${i}]`, found)
    return
  }
  if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEY.test(key) && !PUBLIC_ON_PURPOSE.has(`${path}.${key}`)) found.push(`${path}.${key}`)
      walk(value, `${path}.${key}`, found)
    }
    return
  }
  if (typeof node === "string") {
    if (looksLikeIban(node)) found.push(`${path} looks like an IBAN`)
    if (node.includes(E2E.adminEmail)) found.push(`${path} holds the owner email`)
    if (BEARER.test(node)) found.push(`${path} holds a bearer token`)
  }
}

test("public api outputs carry no bank, secret or owner data", { tag: ["@fr", "@desktop"] }, async ({ request }) => {
  const products = (await (await request.get(`${E2E.apiUrl}/v1/products`)).json()) as { slug: string }[]
  expect(products.length).toBeGreaterThan(0)
  const urls = ["/categories", "/products", `/products/${products[0]!.slug}`, "/locations", "/settings"]

  const found: string[] = []
  for (const url of urls) {
    const res = await request.get(`${E2E.apiUrl}/v1${url}`)
    expect(res.status(), url).toBe(200)
    walk(await res.json(), url, found)
  }
  expect(found).toEqual([])
})

test("public pages carry no bank, secret or owner data", { tag: ["@fr", "@desktop"] }, async ({
  request,
  page,
  step,
}) => {
  await step("the storefront home is what the scan reads", async () => {
    await page.goto(E2E.webUrl)
  })
  const found: string[] = []
  for (const path of PUBLIC_PAGES) {
    const res = await request.get(`${E2E.webUrl}${path}`)
    expect(res.status(), path).toBe(200)
    const html = await res.text()
    if (looksLikeIban(html)) found.push(`${path} looks like it holds an IBAN`)
    if (html.includes(E2E.adminEmail)) found.push(`${path} holds the owner email`)
    if (BEARER.test(html)) found.push(`${path} holds a bearer token`)
  }
  expect(found).toEqual([])
})
