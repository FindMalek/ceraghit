import { readFile } from "node:fs/promises"
import type { Locator, Page } from "@playwright/test"
import { E2E } from "../../env"
import { expect, loginAsOwnerAndWait, test } from "../../fixtures"
import { completeSetup, openDb } from "../../helpers/db"
import { deleteOrdersLike, insertSale, type SaleSeed, salesWindow } from "../../support/db"

type Currency = "TND" | "EUR"
const PREFIX = "E2E-ST-"

/** The browser runs in UTC while the studio is in Tunis (UTC+1, no daylight saving): the day boundary must come from the server. */
test.use({ timezoneId: "UTC" })

const tunisDay = (daysAgo: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(Date.now() - daysAgo * 864e5)
const tunisAt = (daysAgo: number, time: string): Date => new Date(`${tunisDay(daysAgo)}T${time}:00+01:00`)

const SALES: SaleSeed[] = [
  { number: `${PREFIX}01`, status: "paid", currency: "TND", totalMinor: 120_000, paidAt: tunisAt(2, "10:00") },
  { number: `${PREFIX}02`, status: "paid", currency: "TND", totalMinor: 85_500, paidAt: tunisAt(3, "15:00") },
  { number: `${PREFIX}03`, status: "paid", currency: "TND", totalMinor: 40_000, paidAt: tunisAt(1, "09:30") },
  { number: `${PREFIX}04`, status: "fulfilled", currency: "TND", totalMinor: 30_000, paidAt: tunisAt(4, "11:00") },
  { number: `${PREFIX}05`, status: "paid", currency: "EUR", totalMinor: 5_900, paidAt: tunisAt(2, "10:00") },
  { number: `${PREFIX}06`, status: "paid", currency: "EUR", totalMinor: 12_000, paidAt: tunisAt(5, "13:00") },
  { number: `${PREFIX}07`, status: "refunded", currency: "EUR", totalMinor: 7_000, paidAt: tunisAt(2, "12:00") },
  { number: `${PREFIX}08`, status: "cancelled", currency: "TND", totalMinor: 50_000, paidAt: tunisAt(2, "12:00") },
  { number: `${PREFIX}09`, status: "pending_payment", currency: "TND", totalMinor: 20_000, paidAt: null },
  // the last minutes of the day before the 7 day range, and the first minutes of its first day
  { number: `${PREFIX}10`, status: "paid", currency: "TND", totalMinor: 7_000, paidAt: tunisAt(7, "23:30") },
  { number: `${PREFIX}11`, status: "paid", currency: "TND", totalMinor: 11_000, paidAt: tunisAt(6, "00:10") },
]

/** What the seeded orders add to each range, by the issue's rules: paid or shipped, by paidAt, in their own currency. */
const ADDED: Record<7 | 30, Record<Currency, { total: number; orders: number }>> = {
  7: { TND: { total: 286_500, orders: 5 }, EUR: { total: 17_900, orders: 2 } },
  30: { TND: { total: 293_500, orders: 6 }, EUR: { total: 17_900, orders: 2 } },
}

const baseline: Record<7 | 30, Record<Currency, { total: number; orders: number }>> = {
  7: { TND: { total: 0, orders: 0 }, EUR: { total: 0, orders: 0 } },
  30: { TND: { total: 0, orders: 0 }, EUR: { total: 0, orders: 0 } },
}

test.beforeAll(async () => {
  const db = openDb()
  await completeSetup(db)
  await db.close()
  await deleteOrdersLike(PREFIX)
  for (const days of [7, 30] as const) {
    for (const currency of ["TND", "EUR"] as const) baseline[days][currency] = await salesWindow(currency, days)
  }
  for (const sale of SALES) await insertSale(sale)
})

test.afterAll(async () => {
  await deleteOrdersLike(PREFIX)
})

const minorOf = (text: string, currency: Currency): number =>
  Math.round(Number(text.replace(/[^\d,]/g, "").replace(",", ".")) * (currency === "TND" ? 1000 : 100))

const tile = (page: Page, label: string): Locator =>
  page.locator('[data-slot="card"]').filter({ has: page.getByText(label, { exact: true }) })
const tileValue = (page: Page, label: string): Locator => tile(page, label).locator('[data-slot="card-title"]')

async function openOverview(page: Page, days: 7 | 30): Promise<void> {
  await page.goto(`${E2E.dashboardUrl}/`)
  await expect(tileValue(page, "Ventes en dinars")).toBeVisible()
  if (days === 7) {
    await page.getByRole("combobox", { name: "Période" }).click()
    await page.getByRole("option", { name: "7 derniers jours" }).click()
    await expect(page.getByRole("combobox", { name: "Période" })).toContainText("7 derniers jours")
  }
  await expect(tileValue(page, "Ventes en dinars")).toBeVisible()
}

async function readTile(page: Page, label: string, currency: Currency): Promise<number> {
  return minorOf((await tileValue(page, label).innerText()).trim(), currency)
}

test("the tiles add each currency on its own, count only paid orders and follow the studio day", async ({
  page,
  step,
}) => {
  await loginAsOwnerAndWait(page)

  for (const days of [7, 30] as const) {
    await step(
      `over ${days} days the revenue, order count and average are per currency and match the seed`,
      async () => {
        await openOverview(page, days)
        for (const [currency, label, average] of [
          ["TND", "Ventes en dinars", "Panier moyen (DT)"],
          ["EUR", "Ventes en euros", "Panier moyen (€)"],
        ] as const) {
          const expected = baseline[days][currency].total + ADDED[days][currency].total
          expect(await readTile(page, label, currency), `${currency} revenue over ${days} days`).toBe(expected)
          const window = await salesWindow(currency, days)
          expect(window.total, "the tile and the database agree").toBe(expected)
          expect(await readTile(page, average, currency), `${currency} average`).toBe(
            Math.round(window.total / window.orders),
          )
        }
        const orders = Number(await tileValue(page, "Commandes payées").innerText())
        const counted = baseline[days].TND.orders + baseline[days].EUR.orders
        expect(orders).toBe(counted + ADDED[days].TND.orders + ADDED[days].EUR.orders)
      },
    )
  }

  await step("no figure mixes dinars and euros and there is no total across currencies", async () => {
    const figures = await page.locator('[data-slot="card-title"]').allInnerTexts()
    for (const figure of figures) expect(figure, `"${figure}"`).not.toMatch(/DT[\s\S]*€|€[\s\S]*DT/)
    await expect(page.getByText(/^total$/i)).toHaveCount(0)
    await expect(page.getByText("Ventes en dinars", { exact: true })).toHaveCount(1)
    await expect(page.getByText("Ventes en euros", { exact: true })).toHaveCount(1)
  })

  await step("the page has no horizontal scroll", async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test("the day boundary is the studio midnight, whatever the browser timezone", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)
  const outside = SALES.find((s) => s.number === `${PREFIX}10`)
  const inside = SALES.find((s) => s.number === `${PREFIX}11`)
  expect(outside && inside).toBeTruthy()
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("UTC")

  await step("7 days keep the 00:10 sale of the first day and drop the 23:30 sale of the day before", async () => {
    await openOverview(page, 7)
    const tnd = await readTile(page, "Ventes en dinars", "TND")
    expect(tnd).toBe(baseline[7].TND.total + 286_500)
    expect(tnd).not.toBe(baseline[7].TND.total + 286_500 + 7_000)
  })

  await step("30 days hold both", async () => {
    await openOverview(page, 30)
    expect(await readTile(page, "Ventes en dinars", "TND")).toBe(baseline[30].TND.total + 293_500)
  })
})

test("each chart draws one currency and its days add up to its tile", async ({ page, step }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await loginAsOwnerAndWait(page)
  await openOverview(page, 7)

  for (const [currency, title, label, symbol] of [
    ["TND", "Ventes par jour, dinars", "Ventes en dinars", "DT"],
    ["EUR", "Ventes par jour, euros", "Ventes en euros", "€"],
  ] as const) {
    await step(
      `the ${currency} chart has one point per studio day and they add up to the ${currency} tile`,
      async () => {
        const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) })
        const plot = card.locator(".recharts-cartesian-grid")
        await plot.scrollIntoViewIfNeeded()
        const box = await plot.boundingBox()
        if (!box) throw new Error("chart not drawn")
        const tooltip = card.locator(".recharts-tooltip-wrapper")
        const labelOf = new Set<string>()
        let sum = 0
        for (let i = 0; i < 7; i++) {
          await page.mouse.move(box.x + 1 + (box.width - 2) * (i / 6), box.y + box.height / 2)
          await expect(tooltip).toContainText(symbol)
          const previous = [...labelOf].at(-1)
          if (previous) await expect(tooltip).not.toContainText(previous)
          const text = (await tooltip.innerText()).trim()
          const [day, value] = text.split("\n").map((line) => line.trim())
          expect(text, "a tooltip shows one currency").not.toContain(symbol === "DT" ? "€" : "DT")
          expect(value).toContain(symbol)
          labelOf.add(day ?? "")
          sum += minorOf(value ?? "", currency)
        }
        expect(labelOf.size, "seven different days").toBe(7)
        expect(sum).toBe(await readTile(page, label, currency))
      },
    )
  }
})

test("the tiles equal the paid orders of the orders list, per currency", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)

  await step("the orders list shows the same sums as the 7 day tiles for the seeded orders", async () => {
    await page.goto(`${E2E.dashboardUrl}/orders`)
    await page.getByPlaceholder("Numéro, nom ou email").fill(PREFIX)
    await expect(page.getByText(`${PREFIX}11`, { exact: true }).locator("visible=true")).toBeVisible()
    const dayLabel = (daysAgo: number): string =>
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Tunis" }).format(
        Date.now() - daysAgo * 864e5,
      )
    const sums: Record<Currency, number> = { TND: 0, EUR: 0 }
    for (const sale of SALES) {
      const row = page.locator("tr:visible, li:visible").filter({ hasText: sale.number }).last()
      await expect(row).toBeVisible()
      const text = await row.innerText()
      const money = text.match(/(\d[\d   ]*(?:,\d+)?)\s*(DT|€)/)
      expect(money, `${sale.number} shows its total`).not.toBeNull()
      expect(minorOf(money?.[1] ?? "", sale.currency), `${sale.number} total`).toBe(sale.totalMinor)
      expect(money?.[2]).toBe(sale.currency === "TND" ? "DT" : "€")
      const age = Array.from({ length: 31 }, (_, i) => i).find((i) => text.includes(dayLabel(i)))
      const counts = /Payée|Expédiée/.test(text)
      if (counts && age !== undefined && age <= 6) sums[sale.currency] += sale.totalMinor
    }
    await openOverview(page, 7)
    expect(sums.TND).toBe(ADDED[7].TND.total)
    expect(sums.EUR).toBe(ADDED[7].EUR.total)
    expect((await readTile(page, "Ventes en dinars", "TND")) - baseline[7].TND.total).toBe(sums.TND)
    expect((await readTile(page, "Ventes en euros", "EUR")) - baseline[7].EUR.total).toBe(sums.EUR)
  })
})

test("exporting the sales gives one currency per file and its total is the tile", async ({ page, step }) => {
  await loginAsOwnerAndWait(page)

  for (const days of [7, 30] as const) {
    for (const currency of ["TND", "EUR"] as const) {
      await step(`the ${currency} export over ${days} days holds ${currency} only and equals the tile`, async () => {
        await openOverview(page, days)
        const tileMinor = await readTile(page, currency === "TND" ? "Ventes en dinars" : "Ventes en euros", currency)
        await page.getByRole("combobox", { name: "Devise de l'export" }).click()
        await page.getByRole("option", { name: currency === "TND" ? /dinars/i : /euros/i }).click()
        const [file] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Exporter les ventes" }).click(),
        ])
        expect(file.suggestedFilename()).toBe(`ventes-${currency}-${tunisDay(days - 1)}_${tunisDay(0)}.csv`)
        const lines = (await readFile((await file.path()) as string, "utf8"))
          .replace(/^﻿/, "")
          .trim()
          .split("\r\n")
          .map((line) => line.split(";"))
        const [header, ...rows] = lines
        expect(header).toEqual(["jour", "commandes", "ventes", "devise"])
        const total = rows.pop()
        for (const row of rows) expect(row[3], `row ${row[0]}`).toBe(currency)
        expect(total?.[0]).toBe("TOTAL")
        expect(total?.[3]).toBe(currency)
        expect(minorOf(total?.[2]?.replace(".", ",") ?? "", currency)).toBe(tileMinor)
        expect(Number(total?.[1])).toBe(baseline[days][currency].orders + ADDED[days][currency].orders)
        const sumOfDays = rows.reduce((n, row) => n + minorOf(row[2]?.replace(".", ",") ?? "", currency), 0)
        expect(sumOfDays, "the days add up to the total").toBe(tileMinor)
      })
    }
  }
})
