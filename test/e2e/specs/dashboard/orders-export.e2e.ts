import { readFile } from "node:fs/promises"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { BUYER } from "../../helpers/checkout"
import { completeSetup, openDb } from "../../helpers/db"
import { pieceFor } from "../../support/catalogue"
import { neutraliseOrder, orderId } from "../../support/db"

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
})

/** RFC 4180 reader for `;` files: quoted fields may hold the separator, doubled quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ";") {
      row.push(field)
      field = ""
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i++
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const created: string[] = []

/** The awkward rows would break the naive `;` split of the other export spec, which runs again on the mobile project. */
test.afterEach(async () => {
  for (const number of created.splice(0)) await neutraliseOrder(number)
})

test(
  "the csv export keeps awkward customer text in its own cell and never turns it into a formula",
  { tag: ["@fr", "@desktop"] },
  async ({ page, step }, testInfo) => {
    const piece = await pieceFor(page.request, testInfo)
    const awkward = {
      customerName: '=HYPERLINK("http://evil.example";"clic")',
      city: 'Sfax; "Nord"',
    }
    const arabic = { customerName: "محمد بن علي", city: "تونس" }
    const placed: { number: string; name: string; city: string }[] = []

    await loginAsOwnerAndWait(page)

    await step("two cash on delivery orders with awkward names are shipped, so they count as sales", async () => {
      for (const who of [awkward, arabic]) {
        const made = await page.request.post(`${E2E.apiUrl}/v1/orders`, {
          data: {
            items: [{ productId: piece.id, quantity: 2 }],
            currency: "TND",
            locale: "fr",
            paymentMethod: "cod",
            country: "TN",
            ...BUYER,
            ...who,
          },
        })
        expect(made.ok()).toBe(true)
        const { number } = (await made.json()) as { number: string }
        const id = await orderId(number)
        const shipped = await page.request.post(`${E2E.apiUrl}/v1/admin/orders/${id}/ship`, {
          headers: { "x-csrf-token": "orpc" },
          data: {
            id,
            carrier: "rapid-poste",
            trackingNumber: "RR12345678TN",
            trackingUrl: "https://suivi.example.test/track",
          },
        })
        expect(shipped.ok()).toBe(true)
        created.push(number)
        placed.push({ number, name: who.customerName, city: who.city })
      }
    })

    let rows: string[][] = []
    await step("download the TND file", async () => {
      await page.goto(`${E2E.dashboardUrl}/orders`)
      await page.getByRole("button", { name: "Exporter en CSV" }).click()
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Télécharger le CSV" }).click(),
      ])
      const raw = await readFile((await file.path()) as string, "utf8")
      expect(raw.startsWith("﻿"), "a byte order mark so Excel reads the accents").toBe(true)
      expect(raw).toContain("\r\n")
      rows = parseCsv(raw.slice(1))
    })

    await step("each order is one row of the same width, with its own text in the right cells", async () => {
      const [header, ...body] = rows
      const width = header?.length ?? 0
      expect(header?.slice(0, 4)).toEqual(["numero", "date", "statut", "client"])
      for (const row of body) expect(row.length, `row ${row[0]}`).toBe(width)
      const cell = (number: string, column: string): string => {
        const row = body.find((r) => r[0] === number)
        expect(row, `a row for ${number}`).toBeDefined()
        return (row as string[])[header?.indexOf(column) ?? -1] as string
      }
      for (const order of placed) {
        expect(cell(order.number, "statut")).toBe("fulfilled")
        expect(cell(order.number, "ville")).toBe(order.city)
        expect(cell(order.number, "articles")).toMatch(/ x2$/)
      }
      expect(cell(placed[1]?.number ?? "", "client")).toBe(arabic.customerName)
    })

    await step("a name that starts with = is written as text, not as a formula", async () => {
      const [header, ...body] = rows
      const row = body.find((r) => r[0] === placed[0]?.number)
      const name = row?.[header?.indexOf("client") ?? -1] ?? ""
      expect(name).not.toMatch(/^[=+\-@\t\r]/)
      expect(name).toContain("HYPERLINK")
    })
  },
)
